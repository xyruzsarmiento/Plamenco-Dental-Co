# Plamenco Dental Co. Financial Control

Part 23 keeps financial records separated by source:

- Patient invoices, discounts, payments, receipts, and refunds stay in Billing.
- Operating expenses and expense payments stay in Expenses.
- Inventory supplier bills are created from purchase receipts as one linked expense per receipt.
- Standalone cash adjustments stay in Cash Movements.
- Branch closing uses Cashier Sessions to compare expected cash against actual counted cash.

## Branch Rules

Branch expenses require a branch. Clinic-wide expenses are explicitly marked `clinic_wide` and do not fake a Pulilan or Plaridel branch.

Cashier sessions and cash movements are branch-only because a cash drawer belongs to a physical branch.

## Supplier Bill Rule

The current implementation recognizes inventory purchase expense at goods receipt:

1. Purchase receipt is created by Inventory.
2. Expenses creates one `purchase_receipt` linked expense.
3. Duplicate linked expenses are blocked by source type and source id.
4. Payment against that expense records the supplier bill as partially paid or paid.

If the clinic accountant chooses supplier-invoice-date recognition instead, update the rule before go-live.

## Cash Reconciliation

Expected cash for a branch business day is:

opening cash
+ completed patient cash payments
+ standalone cash-in movements
- cash expense payments
- completed refunds
- standalone cash-out movements

Petty cash disbursements are cash-paid expenses in the `petty_cash` category, so they reduce expected cash through expense payments and are not counted a second time as cash movements.

Closing a cashier session stores expected cash, actual counted cash, variance, variance reason, closing user, and closing timestamp.
