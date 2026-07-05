-- Unities — rebranding: la marca pasa de "Uturn" a "Unities".
-- Solo el seed del catálogo de canjes contenía la marca en datos; el resto del
-- esquema nunca la usó. Idempotente (no hace nada si no queda "Uturn").
update public.redeemables
set title       = replace(replace(title, 'UTURN', 'UNITIES'), 'Uturn', 'Unities'),
    description = replace(replace(description, 'UTURN', 'UNITIES'), 'Uturn', 'Unities')
where title ilike '%uturn%' or description ilike '%uturn%';
