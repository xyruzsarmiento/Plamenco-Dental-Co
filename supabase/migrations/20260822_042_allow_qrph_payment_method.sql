alter table public.payments drop constraint if exists payments_payment_method_check;

alter table public.payments
  add constraint payments_payment_method_check
  check (
    payment_method = any (
      array[
        'cash'::text,
        'gcash'::text,
        'maya'::text,
        'bank_transfer'::text,
        'card'::text,
        'online_gateway'::text,
        'qrph'::text,
        'other'::text
      ]
    )
  );
