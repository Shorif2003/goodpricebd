/**
 * Firestore Service — Single source of truth for all app data.
 *
 * Collections:
 *   - products    (collection of Product docs)
 *   - orders      (collection of Order docs)
 *   - categories  (collection of Category docs)
 *   - settings    (single doc at settings/main of type WebsiteSettings)
 *
 * All read methods (subscribe*) use Firestore `onSnapshot` so changes are pushed
 * to every connected device in real time.
 */
import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  type User,
} from 'firebase/auth';
import { firestore, auth } from './firebase';

// ============================================================================
// TYPES
// ============================================================================
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock: string;
  image: string;
  createdAt: number;
}

export interface Order {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  productPrice: number;
  customerName: string;
  mobile: string;
  address: string;
  quantity: number;
  notes: string;
  status: 'new' | 'confirmed' | 'cancelled';
  date: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface WebsiteSettings {
  storeName: string;
  storeLogo: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  facebookLink: string;
  messengerLink: string;
  googleMapEmbed: string;
  footerText: string;
  websiteTitle: string;
  websiteDescription: string;
  bannerTitle: string;
  bannerSubtitle: string;
  bannerImage: string;
}

export const DEFAULT_SETTINGS: WebsiteSettings = {
  storeName: 'Good Price BD',
  storeLogo: 'GP',
  phone: '01700-000000',
  whatsapp: '01800-111111',
  email: 'support@goodpricebd.com',
  address: '123 Main Road, Gulshan, Dhaka 1212, Bangladesh',
  facebookLink: 'https://facebook.com/goodpricebd',
  messengerLink: 'https://m.me/goodpricebd',
  googleMapEmbed:
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3651.90244243014!2d90.3910801!3d23.7508643!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3755b85848c41f77%3A0x15359a606786c5e!2sDhaka!5e0!3m2!1sen!2sbd!4v1710000000000!5m2!1sen!2sbd',
  footerText: '© 2024 Good Price BD. All rights reserved.',
  websiteTitle: 'Good Price BD - Best Products at Low Price',
  websiteDescription: 'Modern e-commerce website for a Bangladeshi retail business.',
  bannerTitle: 'Big Savings This Season',
  bannerSubtitle: 'Up to 50% off on Electronics & Appliances',
  bannerImage: '',
};

// ============================================================================
// PRODUCTS  (collection: products)
// ============================================================================
export function subscribeProducts(cb: (products: Product[]) => void): Unsubscribe {
  const q = query(collection(firestore, 'products'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) })));
  });
}

export async function addProduct(p: Omit<Product, 'id' | 'createdAt'>): Promise<void> {
  await addDoc(collection(firestore, 'products'), { ...p, createdAt: Date.now() });
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
  await updateDoc(doc(firestore, 'products', id), updates as Record<string, unknown>);
}

export async function deleteProduct(id: string): Promise<void> {
  await deleteDoc(doc(firestore, 'products', id));
}

// ============================================================================
// ORDERS  (collection: orders)
// ============================================================================
export function subscribeOrders(cb: (orders: Order[]) => void): Unsubscribe {
  const q = query(collection(firestore, 'orders'), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) })));
  });
}

export async function addOrder(o: Omit<Order, 'id'>): Promise<void> {
  await addDoc(collection(firestore, 'orders'), o);
}

export async function updateOrderStatus(id: string, status: Order['status']): Promise<void> {
  await updateDoc(doc(firestore, 'orders', id), { status });
}

// ============================================================================
// CATEGORIES  (collection: categories)
// ============================================================================
export function subscribeCategories(cb: (cats: Category[]) => void): Unsubscribe {
  return onSnapshot(collection(firestore, 'categories'), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Category, 'id'>) })));
  });
}

export async function addCategory(name: string): Promise<void> {
  await addDoc(collection(firestore, 'categories'), { name });
}

export async function updateCategory(id: string, name: string, oldName: string): Promise<void> {
  await updateDoc(doc(firestore, 'categories', id), { name });
  // Cascade rename on products is done by the caller (it has the product list).
  // See App.tsx -> handleUpdateCategory.
  if (oldName && oldName !== name) {
    // No-op here; cascade handled in App.tsx for efficiency
  }
}

export async function deleteCategory(id: string): Promise<void> {
  await deleteDoc(doc(firestore, 'categories', id));
}

// ============================================================================
// SETTINGS  (single doc: settings/main)
// ============================================================================
export function subscribeSettings(cb: (s: WebsiteSettings) => void): Unsubscribe {
  return onSnapshot(doc(firestore, 'settings', 'main'), (snap) => {
    if (snap.exists()) {
      cb({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<WebsiteSettings>) });
    } else {
      cb(DEFAULT_SETTINGS);
    }
  });
}

export async function saveSettings(s: WebsiteSettings): Promise<void> {
  await setDoc(doc(firestore, 'settings', 'main'), s, { merge: true });
}

export async function ensureSettingsDoc(): Promise<void> {
  const snap = await getDoc(doc(firestore, 'settings', 'main'));
  if (!snap.exists()) {
    await setDoc(doc(firestore, 'settings', 'main'), DEFAULT_SETTINGS);
  }
}

// ============================================================================
// AUTHENTICATION (Firebase Auth — Email & Password)
// ============================================================================
export async function loginAdmin(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function logoutAdmin(): Promise<void> {
  await signOut(auth);
}

export function onAdminAuthChange(cb: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, cb);
}

export async function changeAdminPassword(newPassword: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Not signed in');
  await updatePassword(auth.currentUser, newPassword);
}

// ============================================================================
// SEED DATA  (one-time admin action to populate Firestore with samples)
// ============================================================================
const SEED_CATEGORIES = [
  'Sanitary & Hardware', 'Electrical Products', 'Clothing & Fashion',
  'Cosmetics & Beauty', 'Home Appliances', 'Mobile Accessories',
  'Electronics', 'Grocery', 'Stationery', 'Other Products',
];

const SEED_PRODUCTS: Omit<Product, 'id' | 'createdAt'>[] = [
  { name: 'Stainless Steel Kitchen Sink', description: 'Premium quality double bowl kitchen sink with drain', price: 8500, category: 'Sanitary & Hardware', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400' },
  { name: 'LED Tube Light 4ft', description: 'Energy efficient 20W LED tube light', price: 450, category: 'Electrical Products', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400' },
  { name: "Men's Formal Shirt", description: 'Cotton formal shirt, slim fit', price: 1200, category: 'Clothing & Fashion', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400' },
  { name: 'Fairness Cream 100ml', description: 'Natural fairness cream with SPF protection', price: 350, category: 'Cosmetics & Beauty', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400' },
  { name: 'Electric Kettle 1.5L', description: 'Stainless steel automatic electric kettle', price: 1850, category: 'Home Appliances', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400' },
  { name: 'USB-C Fast Charger', description: '65W fast charging adapter with cable', price: 890, category: 'Mobile Accessories', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1586816879360-004f5b0c51e5?w=400' },
  { name: 'Wireless Bluetooth Earbuds', description: 'Noise cancelling true wireless earbuds', price: 2499, category: 'Electronics', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400' },
  { name: 'Premium Basmati Rice 5kg', description: 'Extra long grain aromatic rice', price: 650, category: 'Grocery', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400' },
  { name: 'A4 Paper Pack 500 Sheets', description: '80gsm premium white copy paper', price: 420, category: 'Stationery', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1586075010923-f589d0d4e68c?w=400' },
  { name: 'Ceramic Floor Tiles 2x2', description: 'Glossy vitrified floor tiles per box', price: 1850, category: 'Sanitary & Hardware', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400' },
  { name: "Women's Cotton Kurti", description: 'Embroidered cotton kurti, all sizes', price: 1650, category: 'Clothing & Fashion', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?w=400' },
  { name: 'Electric Rice Cooker 1.8L', description: 'Automatic non-stick rice cooker', price: 2450, category: 'Home Appliances', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=400' },
  { name: 'Smart LED TV 32 Inch', description: 'Android smart TV with WiFi', price: 18500, category: 'Electronics', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=400' },
  { name: 'Cooking Oil 5L', description: 'Pure refined sunflower cooking oil', price: 780, category: 'Grocery', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400' },
  { name: 'Power Bank 20000mAh', description: 'Fast charging portable power bank', price: 1450, category: 'Mobile Accessories', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400' },
  { name: 'Bluetooth Speaker', description: 'Waterproof portable Bluetooth speaker', price: 1899, category: 'Electronics', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1608043157636-9ac4f3a3e1e5?w=400' },
  { name: 'Microwave Oven 20L', description: 'Digital microwave with grill function', price: 12500, category: 'Home Appliances', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1574269909862-7e1d70bb8075?w=400' },
  { name: 'Laptop 15.6 inch', description: 'Core i5 8GB RAM 512GB SSD laptop', price: 55000, category: 'Electronics', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400' },
  { name: 'Denim Jeans Men', description: 'Regular fit premium denim jeans', price: 2200, category: 'Clothing & Fashion', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400' },
  { name: 'Vacuum Cleaner', description: 'Bagless vacuum cleaner 1400W', price: 7500, category: 'Home Appliances', stock: 'In Stock', image: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400' },
];

export async function seedSampleData(): Promise<{ products: number; categories: number }> {
  let prodCount = 0;
  let catCount = 0;

  // Seed categories
  for (const name of SEED_CATEGORIES) {
    await addDoc(collection(firestore, 'categories'), { name });
    catCount++;
  }

  // Seed products
  const now = Date.now();
  for (let i = 0; i < SEED_PRODUCTS.length; i++) {
    await addDoc(collection(firestore, 'products'), {
      ...SEED_PRODUCTS[i],
      createdAt: now - (SEED_PRODUCTS.length - i) * 1000,
    });
    prodCount++;
  }

  // Ensure settings doc
  await ensureSettingsDoc();

  return { products: prodCount, categories: catCount };
}
