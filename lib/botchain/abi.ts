/**
 * Drip contract ABI.
 *
 * Hand-written and `as const` rather than imported from `contracts/out`. The const assertion is
 * what gives viem and wagmi their argument and return types; a generated JSON artifact loses that
 * unless it is cast, and a mistyped argument would then only surface as a revert.
 *
 * All custom errors are included so viem can decode reverts and explain to the user exactly why
 * an action failed (e.g. AmountExceedsBalance, StopInPast, AlreadyCancelled).
 */
export const dripAbi = [
  {
    type: "function",
    name: "open",
    stateMutability: "payable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "stopTime", type: "uint64" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "who", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "streamOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          { name: "recipient", type: "address" },
          { name: "startTime", type: "uint64" },
          { name: "stopTime", type: "uint64" },
          { name: "deposit", type: "uint256" },
          { name: "withdrawn", type: "uint256" },
          { name: "cancelled", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "StreamOpened",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "startTime", type: "uint64", indexed: false },
      { name: "stopTime", type: "uint64", indexed: false },
      { name: "deposit", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "StreamCancelled",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "recipientAmount", type: "uint256", indexed: false },
      { name: "senderAmount", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "ZeroValue", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "SenderIsRecipient", inputs: [] },
  { type: "error", name: "StopInPast", inputs: [] },
  {
    type: "error",
    name: "NotFound",
    inputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "error",
    name: "NotRecipient",
    inputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "error",
    name: "NotParty",
    inputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "error",
    name: "AmountExceedsBalance",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "requested", type: "uint256" },
      { name: "available", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "AlreadyCancelled",
    inputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
] as const;

export const contractAbi = dripAbi;
