export const FREE_PDF_LIMIT = 5;
export const FREE_CUSTOM_TEMPLATES_LIMIT = 1;

export const CURRENCIES = [
  { value: "AUD", label: "AUD — Australian Dollar", symbol: "$" },
  { value: "USD", label: "USD — US Dollar", symbol: "$" },
  { value: "EUR", label: "EUR — Euro", symbol: "€" },
  { value: "GBP", label: "GBP — British Pound", symbol: "£" },
];

export const INVOICE_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "PAID", label: "Paid" },
  { value: "VOID", label: "Void" },
  { value: "OVERDUE", label: "Overdue" },
];

export const DOCUMENT_TYPES = [
  { value: "INVOICE", label: "Invoice" },
  { value: "QUOTE", label: "Quotation" },
  { value: "PURCHASE_ORDER", label: "Purchase Order" },
];
