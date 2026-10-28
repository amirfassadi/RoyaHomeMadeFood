# Domestic payments

After reviewing the invoice, customers select Zarinpal or bank transfer (card, Paya or Pol). The order request reserves stock but remains pending until payment is confirmed. Invoice number and numeric payment reference are derived from the same random order code and stored uniquely. The reference is for store reconciliation, not a bank-issued structured deposit identifier.

Set PAYMENT_ACCOUNT_HOLDER and PAYMENT_CARD_NUMBER (16 Latin digits) and/or PAYMENT_IBAN (IR plus 24 digits). No placeholder destination is shown to customers. Apply database migrations and configure ZARINPAL_MERCHANT_ID, NEXT_PUBLIC_SITE_URL and ZARINPAL_SANDBOX before live use. Do not enable production payments until the real merchant account has been tested.

For bank transfers, the administrator must inspect the receiving bank account, then enter the exact amount in Toman and unique bank transaction reference in the order detail. Customer receipts alone do not confirm funds. A transaction lock and unique reference prevent duplicate confirmation and reuse across orders. Cancelled orders cannot be confirmed. Confirmation records paymentConfirmedAt and recalculates delivery from the saved preparation and shipping durations. Pending delivery dates are withheld from customer receipt and tracking responses. createdAt remains the audit timestamp of the request, not payment acceptance.

Zarinpal confirmation relies on server verification, not browser status. Unknown gateway requests are retained for reconciliation; fresh requests can recover through tracking. Existing demo mode does not accept real funds.
