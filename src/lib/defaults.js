// Starting wedding categories (§2) with priorities (§11) and a suggested share of the total target.
export const DEFAULT_CATEGORIES = [
  { name: 'Walima Hall', priority: 'critical', share: 0.15, notes: 'Venue booking and related hall costs' },
  { name: 'Catering / Food', priority: 'critical', share: 0.20, notes: 'Meal, service and guest-related food cost' },
  { name: 'Bride Dress', priority: 'critical', share: 0.08, notes: 'Primary wedding dress budget' },
  { name: 'Bari', priority: 'critical', share: 0.12, notes: 'Bari purchases and related items' },
  { name: 'Family Clothing', priority: 'important', share: 0.06, notes: 'Clothing for close family' },
  { name: 'Home Appliances', priority: 'important', share: 0.10, notes: 'Electronics and essential appliances' },
  { name: 'Home Furniture', priority: 'important', share: 0.10, notes: 'Furniture purchases' },
  { name: 'Home Decor', priority: 'optional', share: 0.03, notes: 'Decor and setup' },
  { name: 'Photography / Video', priority: 'important', share: 0.05, notes: 'Photo and video coverage' },
  { name: 'Gifts / Invitations', priority: 'optional', share: 0.04, notes: 'Gifts, cards and related items' },
  { name: 'Emergency Buffer', priority: 'important', share: 0.07, notes: 'Unexpected wedding costs. Leave untouched unless another category runs over.', is_contingency: true },
]

// Split a total into rounded category targets that add up exactly (remainder goes to the buffer).
export function splitTarget(total, cats = DEFAULT_CATEGORIES) {
  const amounts = cats.map(c => Math.round((total * c.share) / 1000) * 1000)
  const buf = cats.findIndex(c => c.is_contingency)
  amounts[buf >= 0 ? buf : amounts.length - 1] += total - amounts.reduce((a, b) => a + b, 0)
  return amounts
}

export const INCOME_TYPES = ['Salary', 'Freelance', 'Business', 'Bonus', 'Gift', 'Other']

// Expense types (§6). Lifestyle is where warnings get strict first.
export const EXPENSE_TYPES = {
  essential: { label: 'Essential', categories: ['Rent', 'Utilities', 'Fuel', 'Groceries', 'Medical', 'Family', 'Other'] },
  lifestyle: { label: 'Lifestyle', categories: ['Dining out', 'Shopping', 'Entertainment', 'Travel', 'Gadgets', 'Subscriptions', 'Other'] },
  wedding: { label: 'Wedding', categories: [] },
}

export const PRIORITIES = {
  critical: { label: 'Critical', hint: 'Must be funded' },
  important: { label: 'Important', hint: 'Desired but adjustable' },
  optional: { label: 'Optional', hint: 'Can be reduced if needed' },
}

export const STATUS = {
  green: { label: 'Green', meaning: 'On track', icon: '✓' },
  yellow: { label: 'Yellow', meaning: 'Caution', icon: '!' },
  red: { label: 'Red', meaning: 'At risk', icon: '✕' },
}
