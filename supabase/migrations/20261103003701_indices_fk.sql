-- Índices en claves foráneas que no tenían: borrar (o cambiar) un medio de pago, una categoría, un integrante, una
-- entidad o un bien ya no recorre la tabla completa para revisar quién lo usa. Solo índices; idempotente.
create index if not exists fixed_expenses_payment_method_idx on public.fixed_expenses(payment_method_id) where payment_method_id is not null;
create index if not exists loan_payments_payment_method_idx on public.loan_payments(payment_method_id) where payment_method_id is not null;
create index if not exists incomes_member_idx on public.incomes(member_id) where member_id is not null;
create index if not exists incomes_payment_method_idx on public.incomes(payment_method_id) where payment_method_id is not null;
create index if not exists providers_payment_method_idx on public.providers(payment_method_id) where payment_method_id is not null;
create index if not exists investments_entity_idx on public.investments(entity_id) where entity_id is not null;
create index if not exists subscriptions_category_idx on public.subscriptions(category_id) where category_id is not null;
create index if not exists subscriptions_payment_method_idx on public.subscriptions(payment_method_id) where payment_method_id is not null;
create index if not exists goals_asset_idx on public.goals(asset_id) where asset_id is not null;
create index if not exists advisor_consultations_contact_idx on public.advisor_consultations(contact_id) where contact_id is not null;
create index if not exists fixed_expense_payments_expense_idx on public.fixed_expense_payments(expense_id) where expense_id is not null;
create index if not exists fixed_expense_payments_payment_method_idx on public.fixed_expense_payments(payment_method_id) where payment_method_id is not null;
create index if not exists family_members_dep_de_idx on public.family_members(dep_de) where dep_de is not null;
create index if not exists emergency_funds_asset_idx on public.emergency_funds(asset_id) where asset_id is not null;
create index if not exists shared_group_expenses_group_idx on public.shared_group_expenses(group_id);
create index if not exists accountant_notes_share_idx on public.accountant_notes(share_id);
create index if not exists fund_movements_expense_idx on public.fund_movements(expense_id) where expense_id is not null;
create index if not exists card_purchases_category_idx on public.card_purchases(category_id) where category_id is not null;
create index if not exists savings_challenges_category_idx on public.savings_challenges(category_id) where category_id is not null;
create index if not exists extra_incomes_member_idx on public.extra_incomes(member_id) where member_id is not null;
create index if not exists extra_incomes_category_idx on public.extra_incomes(category_id) where category_id is not null;
create index if not exists tax_years_member_idx on public.tax_years(member_id) where member_id is not null;
create index if not exists credit_cards_entity_idx on public.credit_cards(entity_id) where entity_id is not null;
create index if not exists allowances_member_idx on public.allowances(member_id) where member_id is not null;
create index if not exists tax_assets_asset_idx on public.tax_assets(asset_id) where asset_id is not null;
create index if not exists tax_assets_member_idx on public.tax_assets(member_id) where member_id is not null;
