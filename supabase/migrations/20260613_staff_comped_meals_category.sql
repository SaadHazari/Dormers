-- Remap Staff Monthly + Intern Program ledger entries from
-- 'intern_compensation' → 'staff_comped_meals' so they appear as their
-- own group in the credits/audit view.
CREATE OR REPLACE FUNCTION public.expense_category_for_plan(p_plan_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_plan_name = 'Welcome Meal'    THEN 'referee_acquisition'
    WHEN p_plan_name = 'Intern Program'  THEN 'staff_comped_meals'
    WHEN p_plan_name = 'Staff Monthly'   THEN 'staff_comped_meals'
    ELSE NULL
  END;
$function$;

-- Backfill existing ledger rows so historical reports group correctly.
UPDATE public.comped_meal_ledger
   SET expense_category = 'staff_comped_meals'
 WHERE expense_category = 'intern_compensation';
