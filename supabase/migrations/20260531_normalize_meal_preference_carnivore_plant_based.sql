-- Normalise legacy meal_preference values to canonical "Non Veg" / "Veg".
-- The user-visible labels have read "Non-Vegetarian" / "Veg" for a long time;
-- this migration brings the underlying stored values in line so detectors,
-- analytics, and CRM exports stop carrying the old taxonomy.

UPDATE public.customers
SET meal_preference_type = 'Non Veg'
WHERE meal_preference_type = 'Carnivore';

UPDATE public.customers
SET meal_preference_type = 'Veg'
WHERE meal_preference_type = 'Plant-Based';

UPDATE public.customers
SET pending_meal_preference_type = 'Non Veg'
WHERE pending_meal_preference_type = 'Carnivore';

UPDATE public.customers
SET pending_meal_preference_type = 'Veg'
WHERE pending_meal_preference_type = 'Plant-Based';

-- Historical order snapshots get backfilled too. Composite religious-mix
-- strings like 'Religious Preference (Mon, Thu)' are untouched.
UPDATE public.orders
SET meal_preference = 'Non Veg'
WHERE meal_preference = 'Carnivore';

UPDATE public.orders
SET meal_preference = 'Veg'
WHERE meal_preference = 'Plant-Based';
