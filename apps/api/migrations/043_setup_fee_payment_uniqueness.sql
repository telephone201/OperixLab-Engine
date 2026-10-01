CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_setup_fee_agreement
    ON payments(agreement_id)
    WHERE purpose = 'SETUP_FEE';
