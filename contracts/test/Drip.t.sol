// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Drip} from "../src/Drip.sol";

contract RejectEther {
  // Deliberately rejects incoming ether transfers
}

contract DripTest is Test {
  Drip internal drip;

  address internal alice = address(0xA11CE);
  address internal bob = address(0xB0B);
  address internal charlie = address(0xCAFE);

  uint64 internal constant START = 1_760_000_000;
  uint64 internal constant DURATION = 30 days;
  uint64 internal constant STOP = START + DURATION;
  uint256 internal constant DEPOSIT = 30 ether;

  event StreamOpened(
    uint256 indexed id,
    address indexed sender,
    address indexed recipient,
    uint64 startTime,
    uint64 stopTime,
    uint256 deposit
  );

  event Withdrawn(uint256 indexed id, address indexed recipient, uint256 amount);

  event StreamCancelled(uint256 indexed id, uint256 recipientAmount, uint256 senderAmount);

  function setUp() public {
    drip = new Drip();
    vm.warp(START);
    vm.deal(alice, 1_000 ether);
    vm.deal(bob, 1_000 ether);
    vm.deal(charlie, 1_000 ether);
  }

  // --- open tests -------------------------------------------------------------------------------

  function test_RecordsStream() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    assertEq(id, 1);

    Drip.Stream memory s = drip.streamOf(id);
    assertEq(s.sender, alice);
    assertEq(s.recipient, bob);
    assertEq(s.startTime, START);
    assertEq(s.stopTime, STOP);
    assertEq(s.deposit, DEPOSIT);
    assertEq(s.withdrawn, 0);
    assertFalse(s.cancelled);
  }

  function test_EmitsStreamOpened() public {
    vm.expectEmit(true, true, true, true, address(drip));
    emit StreamOpened(1, alice, bob, START, STOP, DEPOSIT);

    vm.prank(alice);
    drip.open{value: DEPOSIT}(bob, STOP);
  }

  // --- balance over time ------------------------------------------------------------------------

  function test_BalanceIncreasesOverTime() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    assertEq(drip.balanceOf(id, bob), 0);
    assertEq(drip.balanceOf(id, alice), DEPOSIT);

    // Warp halfway
    vm.warp(START + (DURATION / 2));
    uint256 half = drip.balanceOf(id, bob);
    assertApproxEqAbs(half, DEPOSIT / 2, 1);
    assertTrue(half > 0);

    // Warp to end
    vm.warp(STOP);
    assertEq(drip.balanceOf(id, bob), DEPOSIT);
    assertEq(drip.balanceOf(id, alice), 0);

    // Warp past end
    vm.warp(STOP + 10 days);
    assertEq(drip.balanceOf(id, bob), DEPOSIT);
    assertEq(drip.balanceOf(id, alice), 0);
  }

  function test_SenderBalanceDecreases() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    uint256 prevSender = drip.balanceOf(id, alice);
    assertEq(prevSender, DEPOSIT);

    vm.warp(START + 1 days);
    uint256 day1Sender = drip.balanceOf(id, alice);
    assertTrue(day1Sender < prevSender);

    vm.warp(START + 10 days);
    uint256 day10Sender = drip.balanceOf(id, alice);
    assertTrue(day10Sender < day1Sender);

    // Third party has zero balance
    assertEq(drip.balanceOf(id, charlie), 0);
  }

  // --- withdraw tests ---------------------------------------------------------------------------

  function test_RecipientCanWithdrawPartial() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    vm.warp(START + (DURATION / 2));
    uint256 available = drip.balanceOf(id, bob);
    uint256 withdrawAmount = available / 2;

    uint256 bobBalBefore = bob.balance;

    vm.expectEmit(true, true, false, true, address(drip));
    emit Withdrawn(id, bob, withdrawAmount);

    vm.prank(bob);
    drip.withdraw(id, withdrawAmount);

    assertEq(bob.balance, bobBalBefore + withdrawAmount);
    assertEq(drip.streamOf(id).withdrawn, withdrawAmount);
    assertEq(drip.balanceOf(id, bob), available - withdrawAmount);

    // Withdraw remainder of available
    vm.prank(bob);
    drip.withdraw(id, available - withdrawAmount);
    assertEq(drip.balanceOf(id, bob), 0);
  }

  // --- cancel tests -----------------------------------------------------------------------------

  function test_CancelSettles() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    vm.warp(START + (DURATION / 2));
    uint256 recipientExpected = drip.balanceOf(id, bob);
    uint256 senderExpected = drip.balanceOf(id, alice);

    uint256 bobBalBefore = bob.balance;
    uint256 aliceBalBefore = alice.balance;

    vm.expectEmit(true, false, false, true, address(drip));
    emit StreamCancelled(id, recipientExpected, senderExpected);

    vm.prank(alice);
    drip.cancel(id);

    assertEq(bob.balance, bobBalBefore + recipientExpected);
    assertEq(alice.balance, aliceBalBefore + senderExpected);
    assertTrue(drip.streamOf(id).cancelled);

    // After cancel, balances are zero
    assertEq(drip.balanceOf(id, bob), 0);
    assertEq(drip.balanceOf(id, alice), 0);
  }

  function test_SenderCanCancel() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    vm.warp(START + 100);
    vm.prank(alice);
    drip.cancel(id);

    assertTrue(drip.streamOf(id).cancelled);
  }

  function test_RecipientCanCancel() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    vm.warp(START + 100);
    vm.prank(bob);
    drip.cancel(id);

    assertTrue(drip.streamOf(id).cancelled);
  }

  // --- guard reverts ----------------------------------------------------------------------------

  function test_Revert_Open_ZeroValue() public {
    vm.expectRevert(Drip.ZeroValue.selector);
    vm.prank(alice);
    drip.open{value: 0}(bob, STOP);
  }

  function test_Revert_Open_ZeroAddress() public {
    vm.expectRevert(Drip.ZeroAddress.selector);
    vm.prank(alice);
    drip.open{value: DEPOSIT}(address(0), STOP);
  }

  function test_Revert_Open_SenderIsRecipient() public {
    vm.expectRevert(Drip.SenderIsRecipient.selector);
    vm.prank(alice);
    drip.open{value: DEPOSIT}(alice, STOP);
  }

  function test_Revert_Open_StopInPast() public {
    vm.expectRevert(Drip.StopInPast.selector);
    vm.prank(alice);
    drip.open{value: DEPOSIT}(bob, START); // <= block.timestamp

    vm.expectRevert(Drip.StopInPast.selector);
    vm.prank(alice);
    drip.open{value: DEPOSIT}(bob, START - 1);
  }

  function test_Revert_Withdraw_NotFound() public {
    vm.expectRevert(abi.encodeWithSelector(Drip.NotFound.selector, 999));
    vm.prank(bob);
    drip.withdraw(999, 1 ether);
  }

  function test_Revert_Withdraw_NotRecipient() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    vm.warp(START + 1 days);
    vm.expectRevert(abi.encodeWithSelector(Drip.NotRecipient.selector, id));
    vm.prank(alice);
    drip.withdraw(id, 1 ether);

    vm.expectRevert(abi.encodeWithSelector(Drip.NotRecipient.selector, id));
    vm.prank(charlie);
    drip.withdraw(id, 1 ether);
  }

  function test_Revert_Withdraw_ZeroValue() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    vm.warp(START + 1 days);
    vm.expectRevert(Drip.ZeroValue.selector);
    vm.prank(bob);
    drip.withdraw(id, 0);
  }

  function test_Revert_Withdraw_AmountExceedsBalance() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    vm.warp(START + 1 days);
    uint256 available = drip.balanceOf(id, bob);

    vm.expectRevert(
      abi.encodeWithSelector(Drip.AmountExceedsBalance.selector, id, available + 1, available)
    );
    vm.prank(bob);
    drip.withdraw(id, available + 1);
  }

  function test_Revert_Withdraw_AlreadyCancelled() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    vm.prank(alice);
    drip.cancel(id);

    vm.expectRevert(abi.encodeWithSelector(Drip.AlreadyCancelled.selector, id));
    vm.prank(bob);
    drip.withdraw(id, 1);
  }

  function test_Revert_Cancel_NotFound() public {
    vm.expectRevert(abi.encodeWithSelector(Drip.NotFound.selector, 999));
    vm.prank(alice);
    drip.cancel(999);
  }

  function test_Revert_Cancel_NotParty() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    vm.expectRevert(abi.encodeWithSelector(Drip.NotParty.selector, id));
    vm.prank(charlie);
    drip.cancel(id);
  }

  function test_Revert_Cancel_AlreadyCancelled() public {
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    vm.prank(alice);
    drip.cancel(id);

    vm.expectRevert(abi.encodeWithSelector(Drip.AlreadyCancelled.selector, id));
    vm.prank(bob);
    drip.cancel(id);
  }

  function test_Revert_TransferFailed_OnWithdraw() public {
    RejectEther rejecter = new RejectEther();
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(address(rejecter), STOP);

    vm.warp(START + 1 days);
    uint256 avail = drip.balanceOf(id, address(rejecter));

    vm.expectRevert(
      abi.encodeWithSelector(Drip.TransferFailed.selector, id, address(rejecter), avail)
    );
    vm.prank(address(rejecter));
    drip.withdraw(id, avail);
  }

  function test_Revert_TransferFailed_OnCancel() public {
    RejectEther rejecter = new RejectEther();
    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(address(rejecter), STOP);

    vm.warp(START + 1 days);
    uint256 recipientOwed = drip.balanceOf(id, address(rejecter));

    vm.expectRevert(
      abi.encodeWithSelector(Drip.TransferFailed.selector, id, address(rejecter), recipientOwed)
    );
    vm.prank(alice);
    drip.cancel(id);
  }

  // --- gas test ---------------------------------------------------------------------------------

  function test_GasCeiling() public {
    // Steady state: warm up nextId and contract storage
    vm.prank(alice);
    drip.open{value: DEPOSIT}(bob, STOP);

    vm.prank(alice);
    uint256 beforeGas = gasleft();
    drip.open{value: DEPOSIT}(bob, STOP);
    uint256 used = beforeGas - gasleft();

    emit log_named_uint("open() gas", used);
    assertLt(used, 150_000, "open() gas exceeded 150,000 ceiling");
  }

  // --- fuzz properties --------------------------------------------------------------------------

  /// @notice Invariant: at cancellation, recipientGot + senderGot == deposit (with zero withdrawals)
  function testFuzz_CancelInvariant(uint32 elapsed) public {
    vm.assume(elapsed > 0 && uint64(elapsed) < DURATION);

    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    vm.warp(START + elapsed);

    uint256 recipientExpected = drip.balanceOf(id, bob);
    uint256 senderExpected = drip.balanceOf(id, alice);

    // Invariant holds in view query
    assertEq(
      recipientExpected + senderExpected,
      DEPOSIT,
      "Invariant before cancel: recipient + sender == deposit"
    );

    uint256 aliceBefore = alice.balance;
    uint256 bobBefore = bob.balance;

    vm.prank(alice);
    drip.cancel(id);

    uint256 recipientGot = bob.balance - bobBefore;
    uint256 senderGot = alice.balance - aliceBefore;

    assertEq(recipientGot, recipientExpected, "Recipient received exact owed balance");
    assertEq(senderGot, senderExpected, "Sender received exact owed balance");
    assertEq(
      recipientGot + senderGot,
      DEPOSIT,
      "Invariant after cancel: recipientGot + senderGot == deposit"
    );
  }

  /// @notice Invariant: withdraw partial, then cancel. recipientGot + senderGot == deposit - withdrawn
  function testFuzz_WithdrawThenCancelInvariant(uint32 warp1, uint32 warp2, uint96 withdrawFraction) public {
    vm.assume(warp1 > 0 && warp1 < DURATION / 2);
    vm.assume(warp2 > warp1 && warp2 < DURATION);
    vm.assume(withdrawFraction > 0);

    vm.prank(alice);
    uint256 id = drip.open{value: DEPOSIT}(bob, STOP);

    // Warp to warp1 and withdraw partial
    vm.warp(START + warp1);
    uint256 available = drip.balanceOf(id, bob);
    vm.assume(available > 100);

    uint256 amountToWithdraw = 1 + (uint256(withdrawFraction) % (available - 1));
    vm.prank(bob);
    drip.withdraw(id, amountToWithdraw);

    // Warp to warp2 and cancel
    vm.warp(START + warp2);

    uint256 recipientExpected = drip.balanceOf(id, bob);
    uint256 senderExpected = drip.balanceOf(id, alice);

    uint256 withdrawnSoFar = drip.streamOf(id).withdrawn;
    assertEq(
      recipientExpected + senderExpected,
      DEPOSIT - withdrawnSoFar,
      "Invariant before cancel with prior withdrawal"
    );

    uint256 aliceBefore = alice.balance;
    uint256 bobBefore = bob.balance;

    vm.prank(bob);
    drip.cancel(id);

    uint256 recipientGot = bob.balance - bobBefore;
    uint256 senderGot = alice.balance - aliceBefore;

    assertEq(
      recipientGot + senderGot,
      DEPOSIT - withdrawnSoFar,
      "Invariant after cancel: recipientGot + senderGot == deposit - withdrawn"
    );
  }
}
