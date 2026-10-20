# Drip

Salary streamed by the second on BOT Chain.

### BOT Chain mainnet (677) — live

| | |
|---|---|
| Contract | [`0x27beC58ab2E4641CcF911773A96a6Bc55686C5e7`](https://scan.botchain.ai/address/0x27beC58ab2E4641CcF911773A96a6Bc55686C5e7) · source verified |
| Deploy block | 27323017 |

### Bohr testnet (968) — live

| | |
|---|---|
| Contract | [`0x45B737380Ad888C1c279D5d9f373aD5c90D724D6`](https://scan.bohr.life/address/0x45B737380Ad888C1c279D5d9f373aD5c90D724D6) · source verified |
| Deploy block | 27397071 |

The two addresses differ because the deployer's nonce diverged between the chains; each is this
contract on its own network. The site targets mainnet.

---

## What it does
Drip allows a sender to deposit BOT and stream it to a recipient continuously over time. The recipient can withdraw vested funds in partial chunks or in full at any time.

## Cancellation settlement invariant
Either the sender or the recipient can cancel an active stream at any moment. Upon cancellation:
`recipientOwed + senderOwed == deposit - stream.withdrawn`
All unwithdrawn streamed funds immediately transfer to the recipient, and all unstreamed balance immediately refunds to the sender in the single transaction.

## What it deliberately cannot do
- **No owner**: no fee rake, no pause, no admin
- **No rate tampering**: stream parameters cannot be altered after opening
- **No partial stream freeze**: a stream is either active, completed, or cancelled

## Gas
- `open()`: ~128k gas (target: ~130k)
- `withdraw()`: ~38k gas
- `cancel()`: ~52k gas

## Honest limits
- Integer division in rate calculation floors to wei per second; any rounding dust is settled accurately at completion or cancellation
- Validator timestamp drift (~15 seconds) means sub-minute streaming should not be relied upon for exact financial seconds
