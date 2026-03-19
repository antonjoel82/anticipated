// --- Types ---

export type DashboardStat = {
  id: string
  label: string
  value: string
  change: string
  isChangePositive: boolean
  linkTo: string
}

export type OrderStatus = 'completed' | 'processing' | 'shipped' | 'cancelled'

export type Order = {
  id: string
  customerName: string
  email: string
  amount: number
  status: OrderStatus
  date: string
  itemCount: number
}

export type LineItem = {
  name: string
  quantity: number
  unitPrice: number
}

export type TimelineEvent = {
  event: string
  date: string
  description: string
}

export type OrderDetail = Order & {
  lineItems: Array<LineItem>
  shippingAddress: {
    street: string
    city: string
    state: string
    zip: string
  }
  timeline: Array<TimelineEvent>
  notes: string
}

export type OnboardingField = {
  name: string
  label: string
  type: 'text' | 'email' | 'select' | 'textarea'
  defaultValue: string
  placeholder: string
  options?: Array<string>
}

export type OnboardingStep = {
  step: number
  title: string
  description: string
  fields: Array<OnboardingField>
}

// --- Dashboard ---

export const DASHBOARD_STATS: Array<DashboardStat> = [
  { id: 'total-orders', label: 'Total Orders', value: '1,284', change: '+12.5%', isChangePositive: true, linkTo: '/orders' },
  { id: 'revenue', label: 'Revenue', value: '$48,290', change: '+8.2%', isChangePositive: true, linkTo: '/orders' },
  { id: 'active-users', label: 'Active Users', value: '342', change: '-2.1%', isChangePositive: false, linkTo: '/' },
  { id: 'onboarding', label: 'Pending Setup', value: '18', change: '+3', isChangePositive: false, linkTo: '/onboarding' },
]

// --- Orders ---

export const ORDERS: Array<Order> = [
  { id: 'ORD-001', customerName: 'Alice Chen', email: 'alice@acme.co', amount: 1250.00, status: 'completed', date: '2024-01-15', itemCount: 3 },
  { id: 'ORD-002', customerName: 'Bob Martinez', email: 'bob@globex.io', amount: 890.50, status: 'shipped', date: '2024-01-14', itemCount: 2 },
  { id: 'ORD-003', customerName: 'Carol Wu', email: 'carol@initech.com', amount: 2100.00, status: 'processing', date: '2024-01-14', itemCount: 5 },
  { id: 'ORD-004', customerName: 'David Kim', email: 'david@hooli.net', amount: 450.75, status: 'completed', date: '2024-01-13', itemCount: 1 },
  { id: 'ORD-005', customerName: 'Eva Singh', email: 'eva@piedpiper.com', amount: 3200.00, status: 'cancelled', date: '2024-01-13', itemCount: 4 },
  { id: 'ORD-006', customerName: 'Frank Lee', email: 'frank@umbrella.co', amount: 675.25, status: 'shipped', date: '2024-01-12', itemCount: 2 },
  { id: 'ORD-007', customerName: 'Grace Park', email: 'grace@wayne.ent', amount: 1890.00, status: 'processing', date: '2024-01-12', itemCount: 3 },
  { id: 'ORD-008', customerName: 'Henry Zhao', email: 'henry@stark.ind', amount: 520.00, status: 'completed', date: '2024-01-11', itemCount: 1 },
  { id: 'ORD-009', customerName: 'Iris Patel', email: 'iris@oscorp.com', amount: 4100.50, status: 'shipped', date: '2024-01-11', itemCount: 6 },
  { id: 'ORD-010', customerName: 'Jack Thompson', email: 'jack@lexcorp.co', amount: 780.00, status: 'completed', date: '2024-01-10', itemCount: 2 },
  { id: 'ORD-011', customerName: 'Karen Davis', email: 'karen@cyberdyne.io', amount: 1650.25, status: 'processing', date: '2024-01-10', itemCount: 3 },
  { id: 'ORD-012', customerName: 'Leo Garcia', email: 'leo@weyland.corp', amount: 290.00, status: 'completed', date: '2024-01-09', itemCount: 1 },
]

// --- Order Detail Generator ---

const PRODUCTS: Array<string> = [
  'Mechanical Keyboard', 'USB-C Hub', 'Monitor Stand', 'LED Desk Lamp',
  'Wireless Mouse', 'HD Webcam', 'Noise-Canceling Headphones', 'Laptop Sleeve',
  'Ergonomic Chair Mat', 'Cable Management Kit', 'Monitor Light Bar', 'Desk Organizer',
]

const STREETS: Array<string> = [
  '123 Market St', '456 Oak Ave', '789 Pine Rd', '321 Elm Blvd',
  '654 Cedar Ln', '987 Birch Way', '147 Maple Dr', '258 Walnut St',
  '369 Cherry Pl', '741 Spruce Ct', '852 Ash Pkwy', '963 Willow Rd',
]

const CITIES: Array<string> = [
  'San Francisco', 'Portland', 'Seattle', 'Austin',
  'Denver', 'Boston', 'Chicago', 'New York',
  'Los Angeles', 'Miami', 'Atlanta', 'Nashville',
]

const US_STATES: Array<string> = ['CA', 'OR', 'WA', 'TX', 'CO', 'MA', 'IL', 'NY', 'CA', 'FL', 'GA', 'TN']

const ZIPS: Array<string> = [
  '94105', '97201', '98101', '73301', '80201', '02101',
  '60601', '10001', '90001', '33101', '30301', '37201',
]

const NOTES: Array<string> = [
  'Leave at front door per customer request.',
  'Requires signature on delivery.',
  '',
  'Gift wrap requested — holiday packaging.',
  'Expedited shipping selected.',
  '',
]

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function generateTimeline(order: Order): Array<TimelineEvent> {
  const baseDate = new Date(order.date)

  const events: Array<TimelineEvent> = [
    { event: 'Order Placed', date: formatDate(addDays(baseDate, -3)), description: 'Payment confirmed via Stripe' },
  ]

  if (order.status !== 'cancelled') {
    events.unshift({ event: 'Processing', date: formatDate(addDays(baseDate, -2)), description: 'Items picked and packed at warehouse' })
  }

  if (order.status === 'shipped' || order.status === 'completed') {
    events.unshift({ event: 'Shipped', date: formatDate(addDays(baseDate, -1)), description: `Tracking: 1Z${order.id.replace('ORD-', '')}AA1012345` })
  }

  if (order.status === 'completed') {
    events.unshift({ event: 'Delivered', date: order.date, description: 'Package delivered to front door' })
  }

  if (order.status === 'cancelled') {
    events.unshift({ event: 'Cancelled', date: formatDate(addDays(baseDate, -1)), description: 'Cancelled by customer — full refund issued' })
  }

  return events
}

export function getOrderDetail(orderId: string): OrderDetail {
  const order: Order | undefined = ORDERS.find((o) => o.id === orderId)
  if (!order) throw new Error(`Order ${orderId} not found`)

  const orderIndex: number = ORDERS.indexOf(order)

  const lineItems: Array<LineItem> = Array.from({ length: order.itemCount }, (_, i) => ({
    name: PRODUCTS[(orderIndex * 3 + i) % PRODUCTS.length],
    quantity: 1 + ((orderIndex + i) % 3),
    unitPrice: Math.round((order.amount / order.itemCount) * 100) / 100,
  }))

  return {
    ...order,
    lineItems,
    shippingAddress: {
      street: STREETS[orderIndex % STREETS.length],
      city: CITIES[orderIndex % CITIES.length],
      state: US_STATES[orderIndex % US_STATES.length],
      zip: ZIPS[orderIndex % ZIPS.length],
    },
    timeline: generateTimeline(order),
    notes: NOTES[orderIndex % NOTES.length],
  }
}

// --- Dashboard Charts ---

export type RevenueDataPoint = {
  date: string
  label: string
  revenue: number
  orders: number
}

export type StatusBreakdown = {
  status: OrderStatus
  count: number
}

export const REVENUE_BY_DAY: Array<RevenueDataPoint> = [
  { date: '2024-01-09', label: 'Jan 9', revenue: 290.00, orders: 1 },
  { date: '2024-01-10', label: 'Jan 10', revenue: 2430.25, orders: 2 },
  { date: '2024-01-11', label: 'Jan 11', revenue: 4620.50, orders: 2 },
  { date: '2024-01-12', label: 'Jan 12', revenue: 2565.25, orders: 2 },
  { date: '2024-01-13', label: 'Jan 13', revenue: 3650.75, orders: 2 },
  { date: '2024-01-14', label: 'Jan 14', revenue: 2990.50, orders: 2 },
  { date: '2024-01-15', label: 'Jan 15', revenue: 1250.00, orders: 1 },
]

export const STATUS_BREAKDOWN: Array<StatusBreakdown> = [
  { status: 'completed', count: 5 },
  { status: 'shipped', count: 3 },
  { status: 'processing', count: 3 },
  { status: 'cancelled', count: 1 },
]

// --- Onboarding ---

export const ONBOARDING_STEPS: Array<OnboardingStep> = [
  {
    step: 1,
    title: 'Your Profile',
    description: 'Tell us about yourself so we can personalize your experience.',
    fields: [
      { name: 'firstName', label: 'First Name', type: 'text', defaultValue: '', placeholder: 'Jane' },
      { name: 'lastName', label: 'Last Name', type: 'text', defaultValue: '', placeholder: 'Smith' },
      { name: 'email', label: 'Work Email', type: 'email', defaultValue: '', placeholder: 'jane@company.com' },
      { name: 'role', label: 'Role', type: 'select', defaultValue: 'engineer', placeholder: 'Select your role', options: ['Engineer', 'Designer', 'Product Manager', 'Data Scientist', 'Executive', 'Other'] },
    ],
  },
  {
    step: 2,
    title: 'Your Company',
    description: 'Help us understand your organization.',
    fields: [
      { name: 'companyName', label: 'Company Name', type: 'text', defaultValue: '', placeholder: 'Acme Inc.' },
      { name: 'industry', label: 'Industry', type: 'select', defaultValue: 'technology', placeholder: 'Select industry', options: ['Technology', 'Healthcare', 'Finance', 'Retail', 'Education', 'Manufacturing', 'Other'] },
      { name: 'companySize', label: 'Company Size', type: 'select', defaultValue: '11-50', placeholder: 'Select size', options: ['1-10', '11-50', '51-200', '201-1000', '1000+'] },
      { name: 'website', label: 'Website', type: 'text', defaultValue: '', placeholder: 'https://acme.com' },
    ],
  },
  {
    step: 3,
    title: 'Choose a Plan',
    description: 'Select the plan that works best for your team.',
    fields: [
      { name: 'plan', label: 'Plan', type: 'select', defaultValue: 'pro', placeholder: 'Select a plan', options: ['Free — $0/mo', 'Pro — $29/mo', 'Enterprise — $99/mo'] },
      { name: 'billingCycle', label: 'Billing Cycle', type: 'select', defaultValue: 'monthly', placeholder: 'Select cycle', options: ['Monthly', 'Annual (save 20%)'] },
      { name: 'seats', label: 'Team Seats', type: 'select', defaultValue: '5', placeholder: 'Number of seats', options: ['1', '5', '10', '25', '50', '100+'] },
    ],
  },
  {
    step: 4,
    title: 'Review & Confirm',
    description: 'Review your selections before getting started.',
    fields: [],
  },
]
