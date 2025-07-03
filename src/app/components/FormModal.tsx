'use client';

import OrderForm from './OrderForm';

interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FormModal({ isOpen, onClose }: FormModalProps) {
  return <OrderForm isOpen={isOpen} onClose={onClose} />;
} 