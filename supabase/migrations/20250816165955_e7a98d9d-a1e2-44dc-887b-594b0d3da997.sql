-- Create credit_transactions table to track credit history
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'used', 'refund')),
  description TEXT,
  stripe_session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own transactions" 
ON public.credit_transactions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Edge functions can insert transactions" 
ON public.credit_transactions 
FOR INSERT 
WITH CHECK (true);

-- Create function to add credits and record transaction
CREATE OR REPLACE FUNCTION public.add_credits_with_transaction(
  p_user_id UUID,
  p_credits INTEGER,
  p_description TEXT DEFAULT NULL,
  p_stripe_session_id TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Add credits to user profile
  UPDATE public.profiles 
  SET credits = COALESCE(credits, 0) + p_credits,
      updated_at = now()
  WHERE id = p_user_id;
  
  -- Record the transaction
  INSERT INTO public.credit_transactions (
    user_id, 
    amount, 
    transaction_type, 
    description,
    stripe_session_id
  ) VALUES (
    p_user_id, 
    p_credits, 
    'purchase', 
    p_description,
    p_stripe_session_id
  );
END;
$$;