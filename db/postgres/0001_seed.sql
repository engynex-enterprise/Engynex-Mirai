-- v7 · V7-C · Datos iniciales de una base destino NUEVA (planes, tablas ref_* con su fuente, platform_settings…).
-- GENERADO junto con 0001_baseline.sql: son las filas que dejan las 56 migraciones en una base vacía. Idempotente
-- (ON CONFLICT DO NOTHING). No se aplica en el corte desde Supabase: allá los datos llegan con scripts/migrate.
--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: account_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: households; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: books; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: accountant_shares; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: accountant_notes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ad_campaigns; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ads; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ad_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ad_user_daily; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: admin_audit; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: admin_notes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: contacts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: advisor_consultations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ai_cache; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ai_usage; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: family_members; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: allowances; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: allowance_movements; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: api_idempotency; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: attachments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: automation_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: automations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: automation_runs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: backups; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: book_settings; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: broadcasts; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: calendar_events; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: entities; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: credit_cards; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: payment_methods; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: card_payments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: providers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: fixed_expenses; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: card_purchases; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: chat_threads; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: consents; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: coupons; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: emergency_funds; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: income_categories; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: extra_incomes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: feedback; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: fixed_expense_payments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: fund_movements; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: gami_badges; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: gami_missions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: gami_points_ledger; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: gami_state; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: gami_visits; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: goals; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: goal_movements; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: google_connections; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: google_event_map; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: household_invitations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: household_members; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: household_transfers; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: incomes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: integrations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: investments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: keyword_rules; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: liabilities; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: loans; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: loan_payments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: monthly_summaries; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: net_worth_snapshots; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_log; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_outbox; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notification_rules; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.plans VALUES ('premium', 'Premium', 14900, 149000, '{}', '2026-11-03 03:50:26.255052+00', 'Todo Mirai para toda tu familia, sin anuncios.', '{ia,banco,impuestos,familia}', false, true, true, true, 2, 1000) ON CONFLICT DO NOTHING;
INSERT INTO public.plans VALUES ('gratis', 'Gratis', 0, 0, '{"libros": 1, "personas": 2, "automatizaciones": 3}', '2026-11-03 03:50:26.27938+00', 'Lo básico para ordenar tu plata, gratis para siempre.', '{}', true, true, true, false, 1, 100) ON CONFLICT DO NOTHING;


--
-- Data for Name: plan_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: plan_payments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: platform_admins; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: platform_integrations; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.platform_settings VALUES (true, false, '2026-11-03 03:50:26.043126+00', '', 'info', true, true, 'premium', 30, 30, 3, 24, true, 0.001000, true, 80, 24, '{}', true, false, NULL, false, '{}') ON CONFLICT DO NOTHING;


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: push_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: rate_limits; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ref_fiscal_templates; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ref_holidays; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ref_holidays VALUES ('2026-01-01', 'Año Nuevo') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-01-12', 'Reyes Magos') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-03-23', 'San José') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-04-02', 'Jueves Santo') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-04-03', 'Viernes Santo') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-05-01', 'Día del Trabajo') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-05-18', 'Ascensión del Señor') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-06-08', 'Corpus Christi') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-06-15', 'Sagrado Corazón') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-06-29', 'San Pedro y San Pablo') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-07-13', 'Virgen de Chiquinquirá') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-07-20', 'Día de la Independencia') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-08-07', 'Batalla de Boyacá') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-08-17', 'Asunción de la Virgen') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-10-12', 'Día de la Raza') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-11-02', 'Todos los Santos') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-11-16', 'Independencia de Cartagena') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-12-08', 'Inmaculada Concepción') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_holidays VALUES ('2026-12-25', 'Navidad') ON CONFLICT DO NOTHING;


--
-- Data for Name: ref_municipalities; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ref_rates; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ref_renta_calendar; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ref_renta_calendar VALUES (2026, '01', '2026-08-12', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '02', '2026-08-12', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '03', '2026-08-13', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '04', '2026-08-13', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '05', '2026-08-14', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '06', '2026-08-14', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '07', '2026-08-18', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '08', '2026-08-18', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '09', '2026-08-19', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '10', '2026-08-19', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '11', '2026-08-20', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '12', '2026-08-20', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '13', '2026-08-21', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '14', '2026-08-21', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '15', '2026-08-24', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '16', '2026-08-24', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '17', '2026-08-25', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '18', '2026-08-25', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '19', '2026-08-26', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '20', '2026-08-26', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '21', '2026-08-27', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '22', '2026-08-27', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '23', '2026-08-28', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '24', '2026-08-28', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '25', '2026-08-31', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '26', '2026-08-31', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '27', '2026-09-01', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '28', '2026-09-01', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '29', '2026-09-02', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '30', '2026-09-02', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '31', '2026-09-03', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '32', '2026-09-03', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '33', '2026-09-04', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '34', '2026-09-04', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '35', '2026-09-07', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '36', '2026-09-07', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '37', '2026-09-08', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '38', '2026-09-08', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '39', '2026-09-09', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '40', '2026-09-09', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '41', '2026-09-10', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '42', '2026-09-10', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '43', '2026-09-11', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '44', '2026-09-11', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '45', '2026-09-14', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '46', '2026-09-14', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '47', '2026-09-15', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '48', '2026-09-15', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '49', '2026-09-16', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '50', '2026-09-16', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '51', '2026-09-17', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '52', '2026-09-17', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '53', '2026-09-18', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '54', '2026-09-18', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '55', '2026-09-21', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '56', '2026-09-21', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '57', '2026-09-22', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '58', '2026-09-22', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '59', '2026-09-23', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '60', '2026-09-23', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '61', '2026-09-24', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '62', '2026-09-24', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '63', '2026-09-25', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '64', '2026-09-25', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '65', '2026-09-28', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '66', '2026-09-28', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '67', '2026-10-01', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '68', '2026-10-01', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '69', '2026-10-02', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '70', '2026-10-02', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '71', '2026-10-05', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '72', '2026-10-05', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '73', '2026-10-06', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '74', '2026-10-06', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '75', '2026-10-07', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '76', '2026-10-07', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '77', '2026-10-08', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '78', '2026-10-08', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '79', '2026-10-09', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '80', '2026-10-09', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '81', '2026-10-13', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '82', '2026-10-13', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '83', '2026-10-14', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '84', '2026-10-14', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '85', '2026-10-15', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '86', '2026-10-15', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '87', '2026-10-16', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '88', '2026-10-16', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '89', '2026-10-19', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '90', '2026-10-19', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '91', '2026-10-20', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '92', '2026-10-20', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '93', '2026-10-21', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '94', '2026-10-21', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '95', '2026-10-22', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '96', '2026-10-22', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '97', '2026-10-23', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '98', '2026-10-23', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '99', '2026-10-26', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '00', '2026-10-26', 'general') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '01', '2026-10-27', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '02', '2026-10-27', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '03', '2026-10-28', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '04', '2026-10-28', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '05', '2026-10-29', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '06', '2026-10-29', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '07', '2026-10-30', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '08', '2026-10-30', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '09', '2026-11-03', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '10', '2026-11-03', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '11', '2026-11-04', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '12', '2026-11-04', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '13', '2026-11-05', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '14', '2026-11-05', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '15', '2026-11-06', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '16', '2026-11-06', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '17', '2026-11-09', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '18', '2026-11-09', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '19', '2026-11-10', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '20', '2026-11-10', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '21', '2026-11-11', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '22', '2026-11-11', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '23', '2026-11-12', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '24', '2026-11-12', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '25', '2026-11-13', 'sismo_dec1226') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_calendar VALUES (2026, '26', '2026-11-13', 'sismo_dec1226') ON CONFLICT DO NOTHING;


--
-- Data for Name: ref_renta_regimenes; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ref_renta_regimenes VALUES ('general', 'Calendario general', 'Personas naturales según los dos últimos dígitos del NIT.', 'Decreto 2229 de 2023', '{}') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_renta_regimenes VALUES ('sismo_dec1226', 'Plazo especial por el sismo del 10 de agosto de 2026', 'Aplica si tu domicilio en el RUT al 10-ago-2026 estaba en un municipio de las seccionales indicadas y tu NIT termina en 01 a 26. No aplica a grandes contribuyentes. Confírmalo con tu contador.', 'Decreto 1226 de 2026', '{Cali,Palmira,Tuluá,Buenaventura,Pereira,Armenia,Manizales,Quibdó,Popayán}') ON CONFLICT DO NOTHING;


--
-- Data for Name: ref_smmlv; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ref_smmlv VALUES (2026, 1750905.00, 'Decreto 0159 de 2026 (transitorio; Decreto 1469 de 2025 suspendido por el Consejo de Estado)') ON CONFLICT DO NOTHING;


--
-- Data for Name: ref_trm; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ref_usury_rate; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: ref_uvt; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ref_uvt VALUES (2024, 47065.00, 'Resolución DIAN 000187 de 2023') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_uvt VALUES (2025, 49799.00, 'Resolución DIAN 000193 de 2024') ON CONFLICT DO NOTHING;
INSERT INTO public.ref_uvt VALUES (2026, 52374.00, 'Resolución DIAN 000238 de 2025') ON CONFLICT DO NOTHING;


--
-- Data for Name: referral_codes; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: referrals; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: savings_challenges; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: shared_groups; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: shared_group_expenses; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: tax_assets; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: tax_years; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: telegram_links; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_preferences; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: wishlist; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: account_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.account_events_id_seq', 1, false);


--
-- Name: admin_audit_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.admin_audit_id_seq', 1, false);


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 1, false);


--
-- Name: notification_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notification_log_id_seq', 1, false);


--
-- PostgreSQL database dump complete
--


