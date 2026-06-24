/**
 * storageService — Firestore-compatible abstraction layer.
 *
 * This service mimics the Firestore API (getDoc / setDoc / getDocs / addDoc / updateDoc / deleteDoc).
 * In this environment it persists to localStorage. To switch to real Firebase Firestore,
 * replace the implementations below with firebase/firestore calls — the public API is identical.
 *
 * Collections used:
 *   - settings/main      -> WebsiteSettings document
 *   - products           -> Product documents
 *   - orders             -> Order documents
 *   - categories         -> Category documents
 *
 * Firestore-equivalent imports for production:
 *   import { initializeApp } from "firebase/app";
 *   import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc } from "firebase/firestore";
 */

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
  adminPassword: string;
}

const STORAGE_KEYS = {
  products: 'gpbd_products',
  orders: 'gpbd_orders',
  categories: 'gpbd_categories',
  settings: 'gpbd_settings',
  seeded: 'gpbd_seeded_v1',
};

// ---------- Default data (seeded ONCE on first run, then comes from "Firestore") ----------

export const DEFAULT_SETTINGS: WebsiteSettings = {
  storeName: "Good Price BD",
  storeLogo: "GP",
  phone: "01700-000000",
  whatsapp: "01800-111111",
  email: "support@goodpricebd.com",
  address: "123 Main Road, Gulshan, Dhaka 1212, Bangladesh",
  facebookLink: "https://facebook.com/goodpricebd",
  messengerLink: "https://m.me/goodpricebd",
  googleMapEmbed: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3651.90244243014!2d90.3910801!3d23.7508643!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3755b85848c41f77%3A0x15359a606786c5e!2sDhaka!5e0!3m2!1sen!2sbd!4v1710000000000!5m2!1sen!2sbd",
  footerText: "© 2024 Good Price BD. All rights reserved. | Quality Products • Low Prices • Fast Delivery",
  websiteTitle: "Good Price BD - Best Products at Low Price",
  websiteDescription: "Modern e-commerce website for a Bangladeshi retail business.",
  bannerTitle: "Big Savings This Season",
  bannerSubtitle: "Up to 50% off on Electronics & Appliances",
  bannerImage: "",
  adminPassword: "goodprice2024",
};

const DEFAULT_CATEGORIES: string[] = [
  'Sanitary & Hardware',
  'Electrical Products',
  'Clothing & Fashion',
  'Cosmetics & Beauty',
  'Home Appliances',
  'Mobile Accessories',
  'Electronics',
  'Grocery',
  'Stationery',
  'Other Products',
];

const SEED_PRODUCTS: Omit<Product, 'id' | 'createdAt'>[] = [
  { name: "Stainless Steel Kitchen Sink", description: "Premium quality double bowl kitchen sink with drain", price: 8500, category: "Sanitary & Hardware", stock: "In Stock", image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400" },
  { name: "LED Tube Light 4ft", description: "Energy efficient 20W LED tube light", price: 450, category: "Electrical Products", stock: "In Stock", image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400" },
  { name: "Men's Formal Shirt", description: "Cotton formal shirt, slim fit", price: 1200, category: "Clothing & Fashion", stock: "In Stock", image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400" },
  { name: "Fairness Cream 100ml", description: "Natural fairness cream with SPF protection", price: 350, category: "Cosmetics & Beauty", stock: "In Stock", image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400" },
  { name: "Electric Kettle 1.5L", description: "Stainless steel automatic electric kettle", price: 1850, category: "Home Appliances", stock: "In Stock", image: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400" },
  { name: "USB-C Fast Charger", description: "65W fast charging adapter with cable", price: 890, category: "Mobile Accessories", stock: "In Stock", image: "https://images.unsplash.com/photo-1586816879360-004f5b0c51e5?w=400" },
  { name: "Wireless Bluetooth Earbuds", description: "Noise cancelling true wireless earbuds", price: 2499, category: "Electronics", stock: "In Stock", image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400" },
  { name: "Premium Basmati Rice 5kg", description: "Extra long grain aromatic rice", price: 650, category: "Grocery", stock: "In Stock", image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400" },
  { name: "A4 Paper Pack 500 Sheets", description: "80gsm premium white copy paper", price: 420, category: "Stationery", stock: "In Stock", image: "https://images.unsplash.com/photo-1586075010923-f589d0d4e68c?w=400" },
  { name: "Ceramic Floor Tiles 2x2", description: "Glossy vitrified floor tiles per box", price: 1850, category: "Sanitary & Hardware", stock: "In Stock", image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400" },
  { name: "Circuit Breaker 32A", description: "Single pole MCB circuit breaker", price: 280, category: "Electrical Products", stock: "In Stock", image: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400" },
  { name: "Women's Cotton Kurti", description: "Embroidered cotton kurti, all sizes", price: 1650, category: "Clothing & Fashion", stock: "In Stock", image: "https://images.unsplash.com/photo-1617137968427-85924c800a22?w=400" },
  { name: "Lipstick Matte Set", description: "12 piece long lasting matte lipstick kit", price: 1250, category: "Cosmetics & Beauty", stock: "In Stock", image: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400" },
  { name: "Electric Rice Cooker 1.8L", description: "Automatic non-stick rice cooker", price: 2450, category: "Home Appliances", stock: "In Stock", image: "https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=400" },
  { name: "Tempered Glass Screen Protector", description: "9H hardness screen protector for all models", price: 199, category: "Mobile Accessories", stock: "In Stock", image: "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400" },
  { name: "Smart LED TV 32 Inch", description: "Android smart TV with WiFi", price: 18500, category: "Electronics", stock: "In Stock", image: "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=400" },
  { name: "Cooking Oil 5L", description: "Pure refined sunflower cooking oil", price: 780, category: "Grocery", stock: "In Stock", image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400" },
  { name: "Ballpoint Pen Set 12pcs", description: "Smooth writing blue ink pens", price: 180, category: "Stationery", stock: "In Stock", image: "https://images.unsplash.com/photo-1583485088034-5fbeb0a8c36e?w=400" },
  { name: "PVC Water Pipe 1 inch", description: "Heavy duty PVC pipe per 10ft length", price: 650, category: "Sanitary & Hardware", stock: "In Stock", image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400" },
  { name: "Extension Cord 5m", description: "3 pin heavy duty extension cord", price: 550, category: "Electrical Products", stock: "In Stock", image: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400" },
  { name: "Denim Jeans Men", description: "Regular fit premium denim jeans", price: 2200, category: "Clothing & Fashion", stock: "In Stock", image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400" },
  { name: "Face Wash Gel 150ml", description: "Deep cleansing face wash for all skin types", price: 280, category: "Cosmetics & Beauty", stock: "In Stock", image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400" },
  { name: "Blender 500W", description: "3 speed electric blender with jar", price: 1650, category: "Home Appliances", stock: "In Stock", image: "https://images.unsplash.com/photo-1570197786693-0d08c1e7f9c4?w=400" },
  { name: "Power Bank 20000mAh", description: "Fast charging portable power bank", price: 1450, category: "Mobile Accessories", stock: "In Stock", image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400" },
  { name: "Bluetooth Speaker", description: "Waterproof portable Bluetooth speaker", price: 1899, category: "Electronics", stock: "In Stock", image: "https://images.unsplash.com/photo-1608043157636-9ac4f3a3e1e5?w=400" },
  { name: "Green Tea 100 Bags", description: "Premium organic green tea bags", price: 420, category: "Grocery", stock: "In Stock", image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400" },
  { name: "Spiral Notebook A5", description: "200 pages ruled spiral notebook", price: 120, category: "Stationery", stock: "In Stock", image: "https://images.unsplash.com/photo-1531346680760-1d3b1d0b1e4e?w=400" },
  { name: "Shower Head Set", description: "Rainfall shower head with hose", price: 1250, category: "Sanitary & Hardware", stock: "In Stock", image: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400" },
  { name: "Ceiling Fan 56 inch", description: "Energy efficient decorative ceiling fan", price: 2850, category: "Electrical Products", stock: "In Stock", image: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=400" },
  { name: "Kids T-Shirt Pack", description: "Pack of 3 cotton t-shirts for kids", price: 950, category: "Clothing & Fashion", stock: "In Stock", image: "https://images.unsplash.com/photo-1519238263530-99bdd11f2b74?w=400" },
  { name: "Perfume 100ml", description: "Long lasting premium men's perfume", price: 1850, category: "Cosmetics & Beauty", stock: "In Stock", image: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=400" },
  { name: "Microwave Oven 20L", description: "Digital microwave with grill function", price: 12500, category: "Home Appliances", stock: "In Stock", image: "https://images.unsplash.com/photo-1574269909862-7e1d70bb8075?w=400" },
  { name: "Phone Case Premium", description: "Shockproof transparent phone case", price: 350, category: "Mobile Accessories", stock: "In Stock", image: "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400" },
  { name: "Laptop 15.6 inch", description: "Core i5 8GB RAM 512GB SSD laptop", price: 55000, category: "Electronics", stock: "In Stock", image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400" },
  { name: "Mixed Nuts 500g", description: "Premium roasted mixed nuts pack", price: 680, category: "Grocery", stock: "In Stock", image: "https://images.unsplash.com/photo-1608797178974-15b35a64ede9?w=400" },
  { name: "Geometry Box Set", description: "Complete mathematical instruments box", price: 280, category: "Stationery", stock: "In Stock", image: "https://images.unsplash.com/photo-1586075010923-f589d0d4e68c?w=400" },
  { name: "Bathroom Faucet", description: "Brass mixer tap for basin", price: 1650, category: "Sanitary & Hardware", stock: "In Stock", image: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400" },
  { name: "LED Bulb 15W", description: "Cool white LED bulb pack of 3", price: 380, category: "Electrical Products", stock: "In Stock", image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400" },
  { name: "Winter Jacket", description: "Waterproof insulated winter jacket", price: 4500, category: "Clothing & Fashion", stock: "In Stock", image: "https://images.unsplash.com/photo-1551028719-00167b1a5e0f?w=400" },
  { name: "Hair Oil 200ml", description: "Natural coconut hair oil", price: 220, category: "Cosmetics & Beauty", stock: "In Stock", image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400" },
  { name: "Air Fryer 4.5L", description: "Digital air fryer with multiple modes", price: 6500, category: "Home Appliances", stock: "In Stock", image: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=400" },
  { name: "Car Charger Dual USB", description: "Fast car charger with cable", price: 450, category: "Mobile Accessories", stock: "In Stock", image: "https://images.unsplash.com/photo-1586816879360-004f5b0c51e5?w=400" },
  { name: "Digital Camera", description: "20MP compact digital camera", price: 18500, category: "Electronics", stock: "In Stock", image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400" },
  { name: "Honey 500g", description: "Pure natural wildflower honey", price: 580, category: "Grocery", stock: "In Stock", image: "https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=400" },
  { name: "Sticky Notes Set", description: "Colorful sticky notes pack", price: 150, category: "Stationery", stock: "In Stock", image: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=400" },
  { name: "Door Lock Set", description: "Heavy duty cylinder door lock", price: 1850, category: "Sanitary & Hardware", stock: "In Stock", image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400" },
  { name: "Voltage Stabilizer", description: "5KVA automatic voltage stabilizer", price: 4500, category: "Electrical Products", stock: "In Stock", image: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400" },
  { name: "Saree Silk", description: "Premium silk saree with blouse", price: 8500, category: "Clothing & Fashion", stock: "In Stock", image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400" },
  { name: "Sunscreen SPF50", description: "Water resistant sunscreen lotion", price: 450, category: "Cosmetics & Beauty", stock: "In Stock", image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400" },
  { name: "Vacuum Cleaner", description: "Bagless vacuum cleaner 1400W", price: 7500, category: "Home Appliances", stock: "In Stock", image: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400" },
];

function genId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function readCollection<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCollection<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// Seed the "database" on first run only
function seedIfNeeded(): void {
  if (localStorage.getItem(STORAGE_KEYS.seeded)) return;

  // Settings
  if (!localStorage.getItem(STORAGE_KEYS.settings)) {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(DEFAULT_SETTINGS));
  }

  // Categories
  if (!localStorage.getItem(STORAGE_KEYS.categories)) {
    const cats: Category[] = DEFAULT_CATEGORIES.map(name => ({ id: genId(), name }));
    writeCollection(STORAGE_KEYS.categories, cats);
  }

  // Products
  if (!localStorage.getItem(STORAGE_KEYS.products)) {
    const now = Date.now();
    const products: Product[] = SEED_PRODUCTS.map((p, i) => ({
      ...p,
      id: genId(),
      createdAt: now - (SEED_PRODUCTS.length - i) * 1000,
    }));
    writeCollection(STORAGE_KEYS.products, products);
  }

  // Orders
  if (!localStorage.getItem(STORAGE_KEYS.orders)) {
    writeCollection<Order>(STORAGE_KEYS.orders, []);
  }

  localStorage.setItem(STORAGE_KEYS.seeded, '1');
}

// ---------- Public Firestore-style API ----------

export const db = {
  init(): void {
    seedIfNeeded();
  },

  // Settings
  async getSettings(): Promise<WebsiteSettings> {
    seedIfNeeded();
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  },
  async saveSettings(settings: WebsiteSettings): Promise<void> {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  },

  // Products
  async getProducts(): Promise<Product[]> {
    seedIfNeeded();
    return readCollection<Product>(STORAGE_KEYS.products)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
  async addProduct(p: Omit<Product, 'id' | 'createdAt'>): Promise<Product> {
    const products = readCollection<Product>(STORAGE_KEYS.products);
    const newP: Product = { ...p, id: genId(), createdAt: Date.now() };
    products.push(newP);
    writeCollection(STORAGE_KEYS.products, products);
    return newP;
  },
  async updateProduct(id: string, updates: Partial<Product>): Promise<void> {
    const products = readCollection<Product>(STORAGE_KEYS.products);
    const idx = products.findIndex(p => p.id === id);
    if (idx >= 0) {
      products[idx] = { ...products[idx], ...updates };
      writeCollection(STORAGE_KEYS.products, products);
    }
  },
  async deleteProduct(id: string): Promise<void> {
    const products = readCollection<Product>(STORAGE_KEYS.products).filter(p => p.id !== id);
    writeCollection(STORAGE_KEYS.products, products);
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    seedIfNeeded();
    return readCollection<Category>(STORAGE_KEYS.categories);
  },
  async addCategory(name: string): Promise<Category> {
    const cats = readCollection<Category>(STORAGE_KEYS.categories);
    const cat: Category = { id: genId(), name };
    cats.push(cat);
    writeCollection(STORAGE_KEYS.categories, cats);
    return cat;
  },
  async updateCategory(id: string, name: string): Promise<void> {
    const cats = readCollection<Category>(STORAGE_KEYS.categories);
    const old = cats.find(c => c.id === id);
    const oldName = old?.name;
    const idx = cats.findIndex(c => c.id === id);
    if (idx >= 0) {
      cats[idx].name = name;
      writeCollection(STORAGE_KEYS.categories, cats);
      // Cascade: rename category on all products
      if (oldName && oldName !== name) {
        const products = readCollection<Product>(STORAGE_KEYS.products);
        products.forEach(p => { if (p.category === oldName) p.category = name; });
        writeCollection(STORAGE_KEYS.products, products);
      }
    }
  },
  async deleteCategory(id: string): Promise<void> {
    const cats = readCollection<Category>(STORAGE_KEYS.categories).filter(c => c.id !== id);
    writeCollection(STORAGE_KEYS.categories, cats);
  },

  // Orders
  async getOrders(): Promise<Order[]> {
    seedIfNeeded();
    return readCollection<Order>(STORAGE_KEYS.orders)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },
  async addOrder(o: Omit<Order, 'id'>): Promise<Order> {
    const orders = readCollection<Order>(STORAGE_KEYS.orders);
    const newO: Order = { ...o, id: genId() };
    orders.push(newO);
    writeCollection(STORAGE_KEYS.orders, orders);
    return newO;
  },
  async updateOrder(id: string, updates: Partial<Order>): Promise<void> {
    const orders = readCollection<Order>(STORAGE_KEYS.orders);
    const idx = orders.findIndex(o => o.id === id);
    if (idx >= 0) {
      orders[idx] = { ...orders[idx], ...updates };
      writeCollection(STORAGE_KEYS.orders, orders);
    }
  },
};
