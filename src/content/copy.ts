/**
 * COPY
 * ====
 *
 * Short, human language. No "unlock revolutionary capital efficiency", no
 * "synergistic liquidity primitives", no generic corporate crypto copy.
 */

export const HERO_HEADLINE = 'Your Friend is already earning. Get your streaming $RAREFRIENDS early.'

/**
 * What the platform actually does, in three columns. Both halves of the product
 * are shipped, so neither is described as a promise.
 */
export const WHAT_IT_IS = {
  title: 'WHAT RARE ADVANCE DOES',
  lede:
    'Rare Friends pay RF and WETH rewards to active Friends over seven days. Rare Advance sells that future stream to a holder today for less than it will be worth, and funds it from a pool of lenders who choose the terms. Two things can be financed: the stream itself, and the Friend actions that make it bigger.',
  columns: [
    {
      title: '1 · YOUR FRIEND EARNS',
      body: 'Rare Friends streams RF and WETH to active Friends for seven days, based on activation and reward weight.',
      link: 'advance',
    },
    {
      title: '2 · GET IT EARLY, OR GROW IT',
      body: 'Take part of the stream now and let the rest settle later. Or finance activation, hardwiring, promotions and upgrades from the future rewards they create.',
      link: 'grow',
    },
    {
      title: '3 · LENDERS SET THE TERMS',
      body: 'Liquidity providers fund advances and growth actions on their own terms. Holders compare every pool and choose.',
      link: 'liquidity',
    },
  ],
} as const

export const NOT_A_LOAN_SHORT = [
  'Not a loan. Nothing compounds and no interest accrues after you accept.',
  'Not collateral. There is no LTV, no liquidation and no margin call.',
  'Not a credit product. There is no repayment schedule and no credit score.',
  'A sale of an already-streaming receivable, at a discount, that you may end early.',
] as const

export const HERO_SUBHEAD = ['Your Friend is already earning.', "Don't wait to get paid."]

export const HERO_SUPPORT =
  "Turn streaming $RAREFRIENDS rewards into liquidity today — or explore financing the actions that increase your Friend's reward weight."

export const DEMO_NOTE =
  'DEMO NOTE · Rare Friends ownership and protocol data may be live/read-only. Rare Advance financing, liquidity, settlement and burns are simulated. No tokens or NFTs move in this demo.'

export const ADVANCE_HEADLINE = 'GET YOUR RF NOW'
export const ADVANCE_SUB = 'TURN STREAMING REWARDS INTO LIQUIDITY TODAY.'
export const GROW_HEADLINE = "FINANCE YOUR FRIEND'S NEXT STEP"
export const GROW_SUB =
  "What if the rewards an upgraded Friend earns could help finance the action that increases its reward weight?"
export const LIQUIDITY_HEADLINE = 'Put RF to work funding reward advances.'
export const HOW_HEADLINE = "Tomorrow's rewards. Today's liquidity."

export const ACTIVATION_HERO_CAPTION = 'ACTIVATE NOW. PAY FROM FUTURE REWARDS.'

export const NOT_A_LOAN = [
  'This is a REWARD ADVANCE: the sale of an already-streaming RF receivable at a discount.',
  'It is not a debt, not borrowing against an NFT floor, not collateral, not LTV, not liquidation.',
  'There is no monthly repayment, no credit score and no margin call.',
  'The selected Rare Friend’s stream is the financed asset.',
] as const

export const HOW_IT_WORKS = [
  'RARE FRIENDS ACTIVITY',
  'RF / WETH REWARD FUNDING',
  'ACTIVE FRIENDS',
  '7-DAY REWARD STREAM',
  'RARE ADVANCE',
  'LIQUIDITY TODAY',
  'STREAM SETTLEMENT',
]

export const HOW_IT_WORKS_EXT = [
  'LIQUIDITY',
  'FINANCE GROWTH ACTION',
  'ACTIVATE / HARDWIRE / PROMOTE / UPGRADE',
  'RF BURN + REWARD FUNDING',
  'MORE REWARD WEIGHT',
  'FUTURE REWARDS',
  'REPAY FINANCING',
]
