// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Drip
/// @notice Payment streams calculated and paid by the second.
///
/// @dev What this contract deliberately CANNOT do:
/// - No owner: nobody controls this contract after deployment. There are no admin keys, no roles,
///   and no special privileges.
/// - No pause: there is no pause mechanism or emergency freeze.
/// - No recovery hatch: no backdoor or withdrawal mechanism for unowned tokens or funds.
/// - No stream modification: stream parameters (recipient, stop time, deposit) cannot be altered once opened.
///
/// The central safety property is the cancellation settlement invariant:
/// At cancellation, `recipientOwed + senderOwed == deposit - stream.withdrawn` EXACTLY.
/// Funds are settled via pull withdrawals for regular claims, and immediate split settlement on cancel.
contract Drip {
  /// @notice A payment stream.
  /// @param sender The address that deposited funds and opened the stream.
  /// @param recipient The address receiving the streamed funds.
  /// @param startTime Unix timestamp (seconds) when the stream started.
  /// @param stopTime Unix timestamp (seconds) when the stream ends.
  /// @param deposit Total BOT deposited for this stream (in wei).
  /// @param withdrawn Amount of BOT already withdrawn by recipient (in wei).
  /// @param cancelled Whether this stream has been cancelled.
  struct Stream {
    address sender;
    address recipient;
    uint64 startTime;
    uint64 stopTime;
    uint256 deposit;
    uint256 withdrawn;
    bool cancelled;
  }

  /// @dev Monotonically increasing stream identifier. First ID is 1.
  uint256 private _nextId;

  /// @dev Internal mapping from stream ID to stream data.
  mapping(uint256 id => Stream) private _streams;

  /// @notice Emitted when a new payment stream is opened.
  event StreamOpened(
    uint256 indexed id,
    address indexed sender,
    address indexed recipient,
    uint64 startTime,
    uint64 stopTime,
    uint256 deposit
  );

  /// @notice Emitted when a recipient withdraws streamed BOT.
  event Withdrawn(uint256 indexed id, address indexed recipient, uint256 amount);

  /// @notice Emitted when a stream is cancelled by sender or recipient.
  event StreamCancelled(uint256 indexed id, uint256 recipientAmount, uint256 senderAmount);

  error ZeroValue();
  error ZeroAddress();
  error SenderIsRecipient();
  error StopInPast();
  error NotFound(uint256 id);
  error NotRecipient(uint256 id);
  error NotParty(uint256 id);
  error AmountExceedsBalance(uint256 id, uint256 requested, uint256 available);
  error AlreadyCancelled(uint256 id);
  error TransferFailed(uint256 id, address to, uint256 amount);

  /// @notice Open a new payment stream.
  /// @param recipient The address that can withdraw streamed funds.
  /// @param stopTime Unix timestamp (seconds) when the stream finishes.
  /// @return id The sequential identifier for this stream (starting at 1).
  function open(address recipient, uint64 stopTime) external payable returns (uint256 id) {
    if (msg.value == 0) revert ZeroValue();
    if (recipient == address(0)) revert ZeroAddress();
    if (recipient == msg.sender) revert SenderIsRecipient();
    if (stopTime <= block.timestamp) revert StopInPast();

    id = ++_nextId;
    uint64 startTime = uint64(block.timestamp);

    Stream storage stream = _streams[id];
    stream.sender = msg.sender;
    stream.recipient = recipient;
    stream.startTime = startTime;
    stream.stopTime = stopTime;
    stream.deposit = msg.value;

    emit StreamOpened(id, msg.sender, recipient, startTime, stopTime, msg.value);
  }

  /// @notice Available balance for a party in a stream.
  /// @dev For recipient: `streamed - withdrawn`.
  /// For sender: `deposit - stream.withdrawn - recipientBalance` (the unstreamed portion).
  /// For cancelled streams or third parties: returns 0.
  /// @param id The stream identifier.
  /// @param who The address whose balance is being queried.
  /// @return The available balance in wei.
  function balanceOf(uint256 id, address who) public view returns (uint256) {
    Stream storage stream = _streams[id];
    if (stream.cancelled || stream.sender == address(0)) return 0;
    if (who != stream.recipient && who != stream.sender) return 0;

    uint64 stopTime = stream.stopTime;
    uint64 startTime = stream.startTime;
    uint256 current = block.timestamp;
    uint256 t = current < stopTime ? current : stopTime;
    uint256 elapsed = t > startTime ? t - startTime : 0;
    uint256 totalDuration = stopTime - startTime;

    uint256 streamed = totalDuration > 0
      ? (stream.deposit * elapsed) / totalDuration
      : stream.deposit;

    uint256 recipientBalance = streamed > stream.withdrawn ? streamed - stream.withdrawn : 0;

    if (who == stream.recipient) {
      return recipientBalance;
    }

    // sender balance = remainder of unwithdrawn deposit not owed to recipient
    uint256 remainingDeposit = stream.deposit - stream.withdrawn;
    return remainingDeposit > recipientBalance ? remainingDeposit - recipientBalance : 0;
  }

  /// @notice Withdraw streamed BOT as the stream recipient.
  /// @param id The stream identifier.
  /// @param amount Amount in wei to withdraw.
  function withdraw(uint256 id, uint256 amount) external {
    Stream storage stream = _streams[id];
    if (stream.sender == address(0)) revert NotFound(id);
    if (msg.sender != stream.recipient) revert NotRecipient(id);
    if (stream.cancelled) revert AlreadyCancelled(id);
    if (amount == 0) revert ZeroValue();

    uint256 available = balanceOf(id, msg.sender);
    if (amount > available) revert AmountExceedsBalance(id, amount, available);

    // Effects before interactions
    stream.withdrawn += amount;

    emit Withdrawn(id, msg.sender, amount);

    (bool ok, ) = msg.sender.call{value: amount}("");
    if (!ok) revert TransferFailed(id, msg.sender, amount);
  }

  /// @notice Cancel an active stream. Either sender or recipient can cancel.
  /// @dev Settles remaining funds immediately:
  /// recipient receives `balanceOf(id, recipient)`, sender receives `balanceOf(id, sender)`.
  /// Invariant: `recipientOwed + senderOwed == deposit - stream.withdrawn`.
  /// @param id The stream identifier.
  function cancel(uint256 id) external {
    Stream storage stream = _streams[id];
    if (stream.sender == address(0)) revert NotFound(id);
    if (msg.sender != stream.sender && msg.sender != stream.recipient) revert NotParty(id);
    if (stream.cancelled) revert AlreadyCancelled(id);

    uint256 recipientOwed = balanceOf(id, stream.recipient);
    uint256 senderOwed = balanceOf(id, stream.sender);

    // Mark cancelled before interactions to prevent reentrancy
    stream.cancelled = true;

    emit StreamCancelled(id, recipientOwed, senderOwed);

    address recipient = stream.recipient;
    address sender = stream.sender;

    if (recipientOwed > 0) {
      (bool ok, ) = recipient.call{value: recipientOwed}("");
      if (!ok) revert TransferFailed(id, recipient, recipientOwed);
    }

    if (senderOwed > 0) {
      (bool ok, ) = sender.call{value: senderOwed}("");
      if (!ok) revert TransferFailed(id, sender, senderOwed);
    }
  }

  /// @notice Inspect a stream's parameters and current state.
  /// @param id The stream identifier.
  /// @return The stream struct.
  function streamOf(uint256 id) external view returns (Stream memory) {
    return _streams[id];
  }
}
