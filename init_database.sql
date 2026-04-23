-- Create the 3 main tables for the Dormers Application

-- 1. Customers Table (Extends Supabase Auth users)
CREATE TEXT SEARCH DICTIONARY english_stem (TEMPLATE = snowball, Language = english);

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL PRIMARY KEY,
  cid TEXT UNIQUE, -- Optional logic, could be manually updated later
  name TEXT,
  whatsapp_number TEXT,
  dorm_name TEXT,
  meal_preference_type TEXT,
  allergens TEXT,
  spice_level_preference TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Subscriptions Table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  plan_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'Paused', 'Ended'
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  meals_per_day INTEGER DEFAULT 1,
  total_meals INTEGER NOT NULL,
  delivered_meals INTEGER DEFAULT 0,
  paused_days INTEGER DEFAULT 0,
  pause_date TIMESTAMP WITH TIME ZONE,
  has_paused_before BOOLEAN DEFAULT false,
  last_skipped_date TIMESTAMP WITH TIME ZONE,
  skipped_meals_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan TEXT NOT NULL,
  meal_preference TEXT NOT NULL,
  meals_count INTEGER NOT NULL,
  price_per_meal NUMERIC NOT NULL,
  invoice_status TEXT DEFAULT 'Paid',
  checkout_url TEXT,
  stripe_session_id TEXT,
  stripe_payment_id TEXT,
  stripe_receipt_url TEXT,
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  zoho_invoice_number TEXT,
  zoho_invoice_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── AUTH TRIGGER ────────────────────────────────────────────────────────
-- Automatically insert a row into the public.customers table every time a user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.customers (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ─── ROW LEVEL SECURITY (RLS) ────────────────────────────────────────────
-- Ensure users can only query and mutate their own respective data natively.

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Customers Policies
CREATE POLICY "Users can view their own profile"
  ON public.customers FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.customers FOR UPDATE USING (auth.uid() = id);

-- Subscriptions Policies
CREATE POLICY "Users can view their own subscriptions"
  ON public.subscriptions FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Users can update their own subscriptions"
  ON public.subscriptions FOR UPDATE USING (auth.uid() = customer_id);

-- Orders Policies
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT USING (auth.uid() = customer_id);
