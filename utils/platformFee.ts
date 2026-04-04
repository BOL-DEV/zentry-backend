export const calculatePlatformFeeForUnit = (unitPrice: number) => {
  if (unitPrice < 3500) return 100;
  return unitPrice * 0.03;
};

export const calculateOrderPlatformFee = (
  items: Array<{ unitPrice: number; quantity: number }>,
) => {
  return items.reduce((sum, item) => {
    return sum + calculatePlatformFeeForUnit(item.unitPrice) * item.quantity;
  }, 0);
};


