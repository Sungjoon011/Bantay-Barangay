-- 12_paymongo.sql : online payments through PayMongo are stored with their own payment method.
-- Run this on its own (a new enum value cannot be used in the same run that adds it).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PayMongo';
