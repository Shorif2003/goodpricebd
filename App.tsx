import { useState, useEffect, useMemo, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { isFirebaseConfigured } from './firebase';
import {
  type Product, type Order, type Category, type WebsiteSettings, DEFAULT_SETTINGS,
  subscribeProducts, addProduct, updateProduct, deleteProduct,
  subscribeOrders, addOrder, updateOrderStatus,
  subscribeCategories, addCategory, updateCategory, deleteCategory,
  subscribeSettings, saveSettings, ensureSettingsDoc,
  loginAdmin, logoutAdmin, onAdminAuthChange, changeAdminPassword,
  seedSampleData,
} from './firestoreService';

// ============================================================================
// ROUTING
// ============================================================================
type Route =
  | { name: 'home' }
  | { name: 'category'; slug: string }
  | { name: 'search'; query: string }
  | { name: 'admin' };

const slugify = (s: string) =>
  s.toLowerCase().replace(/\s+&\s+/g, '-and-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash) return { name: 'home' };
  const [section, ...rest] = hash.split('/');
  if (section === 'category' && rest[0]) return { name: 'category', slug: rest[0] };
  if (section === 'search') return { name: 'search', query: decodeURIComponent(rest.join('/') || '') };
  if (section === 'admin') return { name: 'admin' };
  return { name: 'home' };
}

function navigate(route: Route): void {
  let hash = '#/';
  if (route.name === 'category') hash = `#/category/${route.slug}`;
  else if (route.name === 'search') hash = `#/search/${encodeURIComponent(route.query)}`;
  else if (route.name === 'admin') hash = '#/admin';
  window.location.hash = hash;
}

// ============================================================================
// MAIN APP
// ============================================================================
export default function App() {
  // If Firebase is not configured yet, show setup screen
  if (!isFirebaseConfigured) {
    return <FirebaseSetupScreen />;
  }

  return <StoreApp />;
}

function StoreApp() {
  const [settings, setSettings] = useState<WebsiteSettings>(DEFAULT_SETTINGS);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingFlags, setLoadingFlags] = useState({ products: true, orders: true, categories: true, settings: true });

  const [route, setRoute] = useState<Route>(parseRoute());
  const [searchInput, setSearchInput] = useState('');
  const [orderProduct, setOrderProduct] = useState<Product | null>(null);
  const [viewOrder, setViewOrder] = useState<Order | null>(null);

  // Admin auth
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [adminTab, setAdminTab] = useState<'orders' | 'products' | 'categories' | 'settings'>('orders');

  // Ensure settings doc exists on first load
  useEffect(() => {
    ensureSettingsDoc().catch(console.error);
  }, []);

  // Subscribe to Firestore — real-time updates across all devices
  useEffect(() => {
    const unsubP = subscribeProducts((p) => { setProducts(p); setLoadingFlags(f => ({ ...f, products: false })); });
    const unsubO = subscribeOrders((o) => { setOrders(o); setLoadingFlags(f => ({ ...f, orders: false })); });
    const unsubC = subscribeCategories((c) => { setCategories(c); setLoadingFlags(f => ({ ...f, categories: false })); });
    const unsubS = subscribeSettings((s) => { setSettings(s); setLoadingFlags(f => ({ ...f, settings: false })); });
    return () => { unsubP(); unsubO(); unsubC(); unsubS(); };
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAdminAuthChange((user) => {
      setAdminUser(user);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  // SEO meta
  useEffect(() => {
    document.title = settings.websiteTitle || 'Good Price BD';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', settings.websiteDescription);
  }, [settings.websiteTitle, settings.websiteDescription]);

  // Hash routing
  useEffect(() => {
    const onHashChange = () => { setRoute(parseRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (route.name === 'search') setSearchInput(route.query);
  }, [route]);

  // Search
  const handleSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) navigate({ name: 'home' });
    else navigate({ name: 'search', query: trimmed });
  }, []);

  const searchResults = useMemo(() => {
    if (route.name !== 'search' || !route.query.trim()) return products;
    const q = route.query.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  }, [route, products]);

  // Category filter
  const currentCategoryName = useMemo(() => {
    if (route.name !== 'category') return null;
    return categories.find(c => slugify(c.name) === route.slug)?.name || null;
  }, [route, categories]);

  const categoryProducts = useMemo(() => {
    if (!currentCategoryName) return [];
    return products.filter(p => p.category === currentCategoryName);
  }, [products, currentCategoryName]);

  // Order submission (customer)
  const handlePlaceOrder = async (form: { customerName: string; mobile: string; address: string; quantity: number; notes: string }) => {
    if (!orderProduct) return;
    await addOrder({
      productId: orderProduct.id,
      productName: orderProduct.name,
      productImage: orderProduct.image,
      productPrice: orderProduct.price,
      customerName: form.customerName,
      mobile: form.mobile,
      address: form.address,
      quantity: form.quantity,
      notes: form.notes,
      status: 'new',
      date: new Date().toISOString(),
    });
  };

  // Admin actions (Firestore writes propagate automatically via subscriptions)
  const handleSaveSettings = async (s: WebsiteSettings) => { await saveSettings(s); };
  const handleAddProduct = async (p: Omit<Product, 'id' | 'createdAt'>) => { await addProduct(p); };
  const handleUpdateProduct = async (id: string, updates: Partial<Product>) => { await updateProduct(id, updates); };
  const handleDeleteProduct = async (id: string) => { await deleteProduct(id); };
  const handleUpdateOrder = async (id: string, status: Order['status']) => { await updateOrderStatus(id, status); };

  const handleAddCategory = async (name: string) => { await addCategory(name); };
  const handleUpdateCategory = async (id: string, name: string) => {
    const cat = categories.find(c => c.id === id);
    const oldName = cat?.name;
    await updateCategory(id, name, oldName || '');
    // Cascade rename on products (client-side fan-out)
    if (oldName && oldName !== name) {
      const affected = products.filter(p => p.category === oldName);
      await Promise.all(affected.map(p => updateProduct(p.id, { category: name })));
    }
  };
  const handleDeleteCategory = async (id: string) => { await deleteCategory(id); };

  // Initial loading
  const initialLoading = Object.values(loadingFlags).some(Boolean);
  if (initialLoading && route.name !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full"></div>
          <p className="text-slate-500 mt-4">Loading store from Firestore...</p>
        </div>
      </div>
    );
  }

  // Admin route
  if (route.name === 'admin') {
    return (
      <AdminPanel
        authChecked={authChecked}
        adminUser={adminUser}
        onLogout={async () => { await logoutAdmin(); navigate({ name: 'home' }); }}
        onBack={() => navigate({ name: 'home' })}
        settings={settings}
        products={products}
        orders={orders}
        categories={categories}
        activeTab={adminTab}
        setActiveTab={setAdminTab}
        onSaveSettings={handleSaveSettings}
        onAddProduct={handleAddProduct}
        onUpdateProduct={handleUpdateProduct}
        onDeleteProduct={handleDeleteProduct}
        onUpdateOrder={handleUpdateOrder}
        onAddCategory={handleAddCategory}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        onViewOrder={setViewOrder}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Header
        settings={settings}
        categories={categories}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        onSearch={handleSearch}
        currentRoute={route}
      />

      {route.name === 'home' && (
        <HomePage settings={settings} categories={categories} products={products} onOrder={setOrderProduct} />
      )}
      {route.name === 'category' && currentCategoryName && (
        <CategoryPage categoryName={currentCategoryName} products={categoryProducts} onOrder={setOrderProduct} />
      )}
      {route.name === 'category' && !currentCategoryName && (
        <div className="max-w-7xl mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold mb-2">Category not found</h2>
          <button onClick={() => navigate({ name: 'home' })} className="text-orange-600 hover:underline">← Back to home</button>
        </div>
      )}
      {route.name === 'search' && (
        <SearchPage query={route.query} results={searchResults} onOrder={setOrderProduct} />
      )}

      <ContactFooter settings={settings} />

      {orderProduct && (
        <OrderModal product={orderProduct} onClose={() => setOrderProduct(null)} onSubmit={handlePlaceOrder} />
      )}
      {viewOrder && (
        <OrderDetailModal order={viewOrder} onClose={() => setViewOrder(null)} onUpdateOrder={handleUpdateOrder} />
      )}
    </div>
  );
}

// ============================================================================
// FIREBASE SETUP SCREEN (shown when env vars are missing)
// ============================================================================
function FirebaseSetupScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-6">
      <div className="max-w-2xl bg-white rounded-3xl shadow-xl p-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center text-white text-2xl">🔥</div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Firebase Not Configured</h1>
            <p className="text-slate-500 text-sm">Connect your Firebase project to continue</p>
          </div>
        </div>

        <div className="space-y-4 text-sm text-slate-700">
          <p>
            This is a production e-commerce app powered by <strong>Firebase Firestore</strong>. To use it, create a
            Firebase project (free tier works fine) and add your config:
          </p>

          <ol className="list-decimal ml-5 space-y-2">
            <li>Go to <a className="text-orange-600 underline" target="_blank" rel="noreferrer" href="https://console.firebase.google.com/">Firebase Console</a> and create a new project</li>
            <li>Add a Web App → copy the Firebase config object</li>
            <li>Enable <strong>Cloud Firestore</strong> (start in production mode)</li>
            <li>Enable <strong>Authentication</strong> → Email/Password provider</li>
            <li>Create an admin user under Authentication → Users → "Add user"</li>
            <li>Create a <code className="bg-slate-100 px-1.5 py-0.5 rounded">.env</code> file in the project root with:</li>
          </ol>

          <pre className="bg-slate-900 text-emerald-300 text-xs p-4 rounded-xl overflow-auto">
{`VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-app.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc`}
          </pre>

          <p>
            Then restart the dev server (<code className="bg-slate-100 px-1.5 py-0.5 rounded">npm run dev</code>) or rebuild for production.
            Full instructions are in <code className="bg-slate-100 px-1.5 py-0.5 rounded">FIREBASE_SETUP.md</code>.
          </p>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-4">
            <p className="text-blue-900 font-semibold mb-1">💡 After setup</p>
            <p className="text-blue-800 text-xs">
              Visit <code className="bg-white px-1.5 py-0.5 rounded">/#/admin</code>, log in with your Firebase admin account,
              then go to Settings → "Seed Sample Data" to populate the store with example products.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HEADER
// ============================================================================
function Header({ settings, categories, searchInput, setSearchInput, onSearch, currentRoute }: {
  settings: WebsiteSettings;
  categories: Category[];
  searchInput: string;
  setSearchInput: (s: string) => void;
  onSearch: (q: string) => void;
  currentRoute: Route;
}) {
  const activeCategorySlug = currentRoute.name === 'category' ? currentRoute.slug : null;

  return (
    <>
      <div className="bg-slate-900 text-white text-sm py-1.5">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center gap-2">
          <span className="truncate">🚚 Free delivery on orders over ৳5,000 | 📞 {settings.phone}</span>
          <button onClick={() => navigate({ name: 'admin' })} className="hover:text-orange-400 whitespace-nowrap text-xs md:text-sm">Admin Portal</button>
        </div>
      </div>

      <header className="bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 gap-4">
            <button onClick={() => navigate({ name: 'home' })} className="flex items-center gap-3 shrink-0">
              <div className="w-11 h-11 bg-gradient-to-br from-blue-700 to-indigo-800 rounded flex items-center justify-center overflow-hidden">
                {settings.storeLogo.startsWith('http') || settings.storeLogo.startsWith('data:') ? (
                  <img src={settings.storeLogo} alt={settings.storeName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-xl font-bold tracking-tighter">{settings.storeLogo}</span>
                )}
              </div>
              <div className="text-left hidden sm:block">
                <div className="font-bold text-xl tracking-tight text-slate-900 leading-tight">{settings.storeName}</div>
                <div className="text-[10px] text-slate-500">Good Products at Low Price</div>
              </div>
            </button>

            <form className="flex-1 max-w-xl hidden md:block" onSubmit={(e) => { e.preventDefault(); onSearch(searchInput); }}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name, category or description..."
                  value={searchInput}
                  onChange={(e) => { setSearchInput(e.target.value); onSearch(e.target.value); }}
                  className="w-full bg-gray-100 border border-gray-300 rounded-full pl-5 pr-12 py-2.5 text-sm focus:outline-none focus:border-orange-500 focus:bg-white"
                />
                <button type="submit" className="absolute right-2 top-1.5 bg-orange-500 hover:bg-orange-600 text-white w-9 h-9 rounded-full" aria-label="Search">🔍</button>
              </div>
            </form>

            <button onClick={() => navigate({ name: 'home' })} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-full text-sm font-medium whitespace-nowrap">🛒 Shop</button>
          </div>

          <div className="md:hidden pb-3">
            <input
              type="text"
              placeholder="Search products..."
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); onSearch(e.target.value); }}
              className="w-full bg-gray-100 border rounded-full px-4 py-2 text-sm focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        <div className="bg-white border-t overflow-x-auto">
          <div className="max-w-7xl mx-auto px-4 flex gap-1 py-2">
            <button onClick={() => navigate({ name: 'home' })} className={`px-4 py-1.5 text-sm whitespace-nowrap rounded-full transition-colors ${currentRoute.name === 'home' ? 'bg-orange-500 text-white' : 'hover:bg-gray-100 text-slate-700'}`}>All</button>
            {categories.map(cat => {
              const slug = slugify(cat.name);
              return (
                <button key={cat.id} onClick={() => navigate({ name: 'category', slug })}
                  className={`px-4 py-1.5 text-sm whitespace-nowrap rounded-full transition-colors ${activeCategorySlug === slug ? 'bg-orange-500 text-white' : 'hover:bg-gray-100 text-slate-700'}`}>
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
      </header>
    </>
  );
}

// ============================================================================
// HOMEPAGE
// ============================================================================
function HomePage({ settings, categories, products, onOrder }: {
  settings: WebsiteSettings; categories: Category[]; products: Product[]; onOrder: (p: Product) => void;
}) {
  const featured = products.slice(0, 10);
  const newProducts = [...products].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  const bestSelling = products.slice(5, 15);

  return (
    <>
      <HeroSlider settings={settings} />

      <Section title="Featured Products" viewAllLabel="View All Products"
        onViewAll={() => navigate({ name: 'search', query: ' ' })} products={featured} onOrder={onOrder} />

      <div className="bg-white py-10">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-bold tracking-tight mb-6">Shop by Category</h2>
          {categories.length === 0 ? (
            <div className="text-slate-500 text-sm">No categories yet. Admin can add categories from the dashboard.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {categories.map(cat => {
                const count = products.filter(p => p.category === cat.name).length;
                return (
                  <button key={cat.id} onClick={() => navigate({ name: 'category', slug: slugify(cat.name) })}
                    className="p-6 bg-gray-50 hover:bg-orange-50 border rounded-2xl text-left transition group">
                    <div className="font-semibold group-hover:text-orange-600">{cat.name}</div>
                    <div className="text-sm text-slate-500 mt-0.5">{count} {count === 1 ? 'product' : 'products'}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Section title="New Arrivals" viewAllLabel="View All"
        onViewAll={() => navigate({ name: 'search', query: ' ' })} products={newProducts} onOrder={onOrder} />

      <div className="bg-white">
        <Section title="Best Sellers" viewAllLabel="View All"
          onViewAll={() => navigate({ name: 'search', query: ' ' })} products={bestSelling} onOrder={onOrder} />
      </div>

      {categories.slice(0, 4).map(cat => {
        const catProducts = products.filter(p => p.category === cat.name).slice(0, 5);
        if (catProducts.length === 0) return null;
        return (
          <Section key={cat.id} title={cat.name} viewAllLabel={`View All ${cat.name}`}
            onViewAll={() => navigate({ name: 'category', slug: slugify(cat.name) })}
            products={catProducts} onOrder={onOrder} />
        );
      })}

      {products.length === 0 && (
        <div className="max-w-3xl mx-auto px-4 py-12 text-center">
          <div className="bg-white border rounded-2xl p-10">
            <div className="text-5xl mb-3">🛒</div>
            <h3 className="text-xl font-bold mb-2">No products yet</h3>
            <p className="text-slate-500 text-sm mb-4">The store is empty. The admin can add products or seed sample data from the dashboard.</p>
            <button onClick={() => navigate({ name: 'admin' })} className="bg-slate-900 text-white px-5 py-2 rounded-lg text-sm">Go to Admin Portal</button>
          </div>
        </div>
      )}
    </>
  );
}

function HeroSlider({ settings }: { settings: WebsiteSettings }) {
  const slides = useMemo(() => [
    { title: settings.bannerTitle, subtitle: settings.bannerSubtitle, color: 'from-blue-900 to-slate-900', image: settings.bannerImage },
    { title: 'New Arrivals Daily', subtitle: 'Fresh stock in all categories every week', color: 'from-emerald-900 to-teal-900', image: '' },
    { title: 'Quality You Can Trust', subtitle: 'Premium products at the best prices in Bangladesh', color: 'from-amber-900 to-orange-900', image: '' },
  ], [settings.bannerTitle, settings.bannerSubtitle, settings.bannerImage]);

  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCurrent(c => (c + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);

  const slide = slides[current];
  return (
    <div className={`relative h-[380px] md:h-[460px] overflow-hidden ${slide.image ? '' : `bg-gradient-to-r ${slide.color}`}`}>
      {slide.image && (
        <div className="absolute inset-0 z-0">
          <img src={slide.image} className="w-full h-full object-cover" alt="" />
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center relative z-10">
        <div className="max-w-xl text-white">
          <div className="uppercase tracking-[3px] text-xs mb-2 opacity-80">SHOP NOW • BANGLADESH</div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter mb-3">{slide.title}</h1>
          <p className="text-lg md:text-xl opacity-90 mb-6">{slide.subtitle}</p>
          <button onClick={() => document.getElementById('featured')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-9 py-3.5 bg-white text-slate-900 font-semibold rounded-full hover:bg-orange-100 shadow-lg">Shop Now →</button>
        </div>
      </div>
      <div className="absolute bottom-6 right-6 flex gap-2 z-10">
        {slides.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)} aria-label={`Slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${current === i ? 'bg-white w-8' : 'bg-white/40 w-4'}`} />
        ))}
      </div>
    </div>
  );
}

function Section({ title, viewAllLabel, onViewAll, products, onOrder }: {
  title: string; viewAllLabel: string; onViewAll: () => void; products: Product[]; onOrder: (p: Product) => void;
}) {
  if (products.length === 0) return null;
  return (
    <div id={title === 'Featured Products' ? 'featured' : undefined} className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex justify-between items-baseline mb-5 gap-4">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <button onClick={onViewAll} className="text-sm text-orange-600 hover:text-orange-700 font-medium whitespace-nowrap">{viewAllLabel} →</button>
      </div>
      <ProductGrid products={products} onOrder={onOrder} />
    </div>
  );
}

function ProductGrid({ products, onOrder }: { products: Product[]; onOrder: (p: Product) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {products.map(p => <ProductCard key={p.id} product={p} onOrder={onOrder} />)}
    </div>
  );
}

function ProductCard({ product, onOrder }: { product: Product; onOrder: (p: Product) => void }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border hover:shadow-xl transition group flex flex-col">
      <div className="aspect-square overflow-hidden bg-gray-100">
        <img src={product.image} alt={product.name} loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://via.placeholder.com/400?text=No+Image'; }} />
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <button onClick={() => navigate({ name: 'category', slug: slugify(product.category) })}
          className="text-xs text-orange-600 hover:underline self-start mb-1">{product.category}</button>
        <div className="font-semibold leading-tight mb-1 line-clamp-2 min-h-[2.5rem]">{product.name}</div>
        <div className="text-xs text-slate-500 mb-3 line-clamp-1">{product.description}</div>
        <div className="mt-auto flex justify-between items-center">
          <div>
            <div className="font-bold text-xl">৳{product.price.toLocaleString()}</div>
            <div className={`text-[10px] ${product.stock === 'In Stock' ? 'text-green-600' : 'text-red-600'}`}>{product.stock}</div>
          </div>
          <button onClick={() => onOrder(product)} className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5 rounded-full font-medium">Order</button>
        </div>
      </div>
    </div>
  );
}

function CategoryPage({ categoryName, products, onOrder }: {
  categoryName: string; products: Product[]; onOrder: (p: Product) => void;
}) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <nav className="text-sm text-slate-500 mb-3">
        <button onClick={() => navigate({ name: 'home' })} className="hover:text-orange-600">Home</button>
        <span className="mx-2">/</span>
        <span className="text-slate-900 font-medium">{categoryName}</span>
      </nav>
      <div className="flex justify-between items-baseline mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{categoryName}</h1>
        <span className="text-sm text-slate-500">{products.length} {products.length === 1 ? 'product' : 'products'}</span>
      </div>
      {products.length === 0 ? (
        <div className="bg-white border rounded-2xl p-12 text-center">
          <div className="text-5xl mb-3">📦</div>
          <p className="text-slate-500">No products in this category yet.</p>
        </div>
      ) : (
        <ProductGrid products={products} onOrder={onOrder} />
      )}
    </div>
  );
}

function SearchPage({ query, results, onOrder }: {
  query: string; results: Product[]; onOrder: (p: Product) => void;
}) {
  const isBrowseAll = query.trim() === '';
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-baseline mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {isBrowseAll ? 'All Products' : <>Results for <span className="text-orange-600">"{query}"</span></>}
        </h1>
        <span className="text-sm text-slate-500">{results.length} {results.length === 1 ? 'product' : 'products'}</span>
      </div>
      {results.length === 0 ? (
        <div className="bg-white border rounded-2xl p-12 text-center">
          <div className="text-5xl mb-3">🔍</div>
          <p className="text-slate-500">No products match "{query}".</p>
          <button onClick={() => navigate({ name: 'home' })} className="mt-4 text-orange-600 hover:underline">← Back to home</button>
        </div>
      ) : (
        <ProductGrid products={results} onOrder={onOrder} />
      )}
    </div>
  );
}

function ContactFooter({ settings }: { settings: WebsiteSettings }) {
  return (
    <>
      <div className="bg-slate-900 text-white py-12">
        <div className="max-w-5xl mx-auto px-4 grid md:grid-cols-2 gap-12">
          <div>
            <div className="uppercase text-orange-400 tracking-widest text-xs mb-3">GET IN TOUCH</div>
            <div className="text-3xl md:text-4xl font-bold tracking-tight mb-8">We're here to help</div>
            <div className="space-y-4 text-sm">
              <div>📞 <span className="font-semibold">Phone:</span> <a href={`tel:${settings.phone}`} className="hover:text-orange-400">{settings.phone}</a></div>
              <div>📱 <span className="font-semibold">WhatsApp:</span> <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="hover:text-orange-400">{settings.whatsapp}</a></div>
              <div>✉️ <span className="font-semibold">Email:</span> <a href={`mailto:${settings.email}`} className="hover:text-orange-400">{settings.email}</a></div>
              <div>📘 <a href={settings.facebookLink} target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">Facebook Page</a></div>
              <div>💬 <a href={settings.messengerLink} target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">Messenger</a></div>
              <div>📍 <span className="font-semibold">Address:</span> {settings.address}</div>
            </div>
          </div>
          <div>
            <div className="text-sm mb-3 text-orange-400 tracking-widest">OUR LOCATION</div>
            <div className="text-xl font-semibold mb-4">{settings.storeName}</div>
            <div className="bg-slate-800 rounded-xl overflow-hidden h-52">
              <iframe src={settings.googleMapEmbed} title="Map" width="100%" height="100%" style={{ border: 0 }}
                allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
          </div>
        </div>
      </div>
      <footer className="bg-black text-slate-400 text-sm py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">{settings.footerText}</div>
      </footer>
    </>
  );
}

// ============================================================================
// ORDER MODAL
// ============================================================================
function OrderModal({ product, onClose, onSubmit }: {
  product: Product; onClose: () => void;
  onSubmit: (form: { customerName: string; mobile: string; address: string; quantity: number; notes: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ customerName: '', mobile: '', address: '', quantity: 1, notes: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(form);
      setSubmitted(true);
      setTimeout(() => onClose(), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {!submitted ? (
          <>
            <div className="flex items-center gap-3 mb-6 pb-4 border-b">
              <img src={product.image} alt="" className="w-16 h-16 rounded-xl object-cover bg-gray-100" />
              <div>
                <h3 className="font-bold text-lg leading-tight">{product.name}</h3>
                <p className="text-sm text-slate-500">৳{product.price.toLocaleString()} per unit</p>
              </div>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <input required placeholder="Full Name *" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} className="w-full border px-4 py-3 rounded-xl focus:outline-none focus:border-orange-500" />
              <input required placeholder="Mobile Number *" value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} className="w-full border px-4 py-3 rounded-xl focus:outline-none focus:border-orange-500" />
              <textarea required placeholder="Full Delivery Address *" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full border px-4 py-3 rounded-xl h-24 resize-y focus:outline-none focus:border-orange-500" />
              <div>
                <label className="text-xs text-slate-500 ml-1">Quantity</label>
                <input type="number" min="1" required value={form.quantity} onChange={e => setForm({ ...form, quantity: Math.max(1, parseInt(e.target.value) || 1) })} className="w-full border px-4 py-3 rounded-xl mt-1" />
              </div>
              <textarea placeholder="Additional Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full border px-4 py-3 rounded-xl h-16 resize-y" />
              <div className="bg-orange-50 rounded-xl p-3 text-sm flex justify-between">
                <span className="text-slate-600">Total ({form.quantity}x):</span>
                <span className="font-bold text-orange-600">৳{(product.price * form.quantity).toLocaleString()}</span>
              </div>
              {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-xl">{error}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose} className="flex-1 py-3 border rounded-xl font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-semibold">
                  {submitting ? 'Submitting...' : 'Submit Order'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="text-6xl mb-6">✅</div>
            <div className="text-2xl font-bold mb-2">Thank you!</div>
            <p className="text-slate-600">Your order has been received.<br />We will contact you shortly.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function OrderDetailModal({ order, onClose, onUpdateOrder }: {
  order: Order; onClose: () => void;
  onUpdateOrder: (id: string, status: Order['status']) => Promise<void>;
}) {
  const date = new Date(order.date);
  const statusColors: Record<Order['status'], string> = {
    new: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b flex justify-between items-start sticky top-0 bg-white rounded-t-3xl">
          <div>
            <div className="text-xs text-slate-500 font-mono">ORDER #{order.id}</div>
            <h2 className="text-2xl font-bold mt-1">Order Details</h2>
          </div>
          <button onClick={onClose} className="text-3xl text-slate-400 hover:text-slate-700 leading-none">×</button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <span className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize ${statusColors[order.status]}`}>{order.status}</span>
            <span className="text-sm text-slate-500">📅 {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Ordered Product</h3>
            <div className="bg-slate-50 rounded-2xl p-4 flex gap-4">
              <img src={order.productImage} alt="" className="w-20 h-20 rounded-xl object-cover bg-gray-200" />
              <div className="flex-1">
                <div className="font-semibold">{order.productName}</div>
                <div className="text-sm text-slate-500 mt-1">Unit Price: ৳{order.productPrice.toLocaleString()}</div>
                <div className="text-sm mt-1">Quantity: <span className="font-semibold">{order.quantity}</span></div>
                <div className="text-sm mt-1">Total: <span className="font-bold text-orange-600">৳{(order.productPrice * order.quantity).toLocaleString()}</span></div>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Customer Information</h3>
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-xs text-slate-500 uppercase">Customer Name</div>
                <div className="font-semibold mt-1">{order.customerName}</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-xs text-slate-500 uppercase">Phone Number</div>
                <div className="font-semibold mt-1">
                  <a href={`tel:${order.mobile}`} className="hover:text-orange-600">📞 {order.mobile}</a>
                  {' · '}
                  <a href={`https://wa.me/${order.mobile.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-green-600 hover:underline">💬 WhatsApp</a>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-xs text-slate-500 uppercase">Full Delivery Address</div>
                <div className="font-medium mt-1 whitespace-pre-wrap break-words">{order.address}</div>
              </div>
              {order.notes && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="text-xs text-slate-500 uppercase">Additional Notes</div>
                  <div className="mt-1 whitespace-pre-wrap break-words">{order.notes}</div>
                </div>
              )}
            </div>
          </div>
          {order.status === 'new' && (
            <div className="flex gap-3 pt-6 border-t">
              <button onClick={() => { onUpdateOrder(order.id, 'confirmed'); onClose(); }} className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold">✓ Confirm Order</button>
              <button onClick={() => { onUpdateOrder(order.id, 'cancelled'); onClose(); }} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold">✕ Cancel Order</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN PANEL (Firebase Authentication)
// ============================================================================
function AdminPanel(props: {
  authChecked: boolean;
  adminUser: User | null;
  onLogout: () => Promise<void>;
  onBack: () => void;
  settings: WebsiteSettings;
  products: Product[];
  orders: Order[];
  categories: Category[];
  activeTab: 'orders' | 'products' | 'categories' | 'settings';
  setActiveTab: (t: 'orders' | 'products' | 'categories' | 'settings') => void;
  onSaveSettings: (s: WebsiteSettings) => Promise<void>;
  onAddProduct: (p: Omit<Product, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onUpdateOrder: (id: string, status: Order['status']) => Promise<void>;
  onAddCategory: (name: string) => Promise<void>;
  onUpdateCategory: (id: string, name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onViewOrder: (o: Order) => void;
}) {
  if (!props.authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">Checking authentication...</div>
      </div>
    );
  }

  if (!props.adminUser) {
    return <AdminLogin settings={props.settings} onBack={props.onBack} />;
  }

  const tabs = [
    { id: 'orders', label: 'Orders', count: props.orders.length, badge: props.orders.filter(o => o.status === 'new').length },
    { id: 'products', label: 'Products', count: props.products.length, badge: 0 },
    { id: 'categories', label: 'Categories', count: props.categories.length, badge: 0 },
    { id: 'settings', label: 'Settings', count: 0, badge: 0 },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold">A</div>
            <div>
              <div className="font-bold text-slate-900">Admin Dashboard</div>
              <div className="text-xs text-slate-500">Signed in as {props.adminUser.email}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={props.onBack} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium">View Store</button>
            <button onClick={props.onLogout} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium">Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-1 mb-6 border-b overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => props.setActiveTab(tab.id)}
              className={`px-5 py-3 font-medium border-b-2 whitespace-nowrap transition-colors relative ${props.activeTab === tab.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {tab.label}
              {tab.count > 0 && <span className="ml-2 text-xs text-slate-400">({tab.count})</span>}
              {tab.badge > 0 && <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs bg-orange-500 text-white rounded-full">{tab.badge}</span>}
            </button>
          ))}
        </div>

        {props.activeTab === 'orders' && <OrdersTab orders={props.orders} onView={props.onViewOrder} onUpdateOrder={props.onUpdateOrder} />}
        {props.activeTab === 'products' && <ProductsTab products={props.products} categories={props.categories} onAdd={props.onAddProduct} onUpdate={props.onUpdateProduct} onDelete={props.onDeleteProduct} />}
        {props.activeTab === 'categories' && <CategoriesTab categories={props.categories} products={props.products} onAdd={props.onAddCategory} onUpdate={props.onUpdateCategory} onDelete={props.onDeleteCategory} />}
        {props.activeTab === 'settings' && <SettingsTab settings={props.settings} onSave={props.onSaveSettings} hasAnyData={props.products.length > 0 || props.categories.length > 0} />}
      </div>
    </div>
  );
}

function AdminLogin({ settings, onBack }: { settings: WebsiteSettings; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginAdmin(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 mb-4 overflow-hidden">
            {settings.storeLogo.startsWith('http') || settings.storeLogo.startsWith('data:')
              ? <img src={settings.storeLogo} className="w-full h-full object-cover" alt="" />
              : <span className="text-white text-2xl font-bold">{settings.storeLogo}</span>}
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Admin Portal</h2>
          <p className="text-slate-500 mt-1">{settings.storeName}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input type="email" placeholder="Admin Email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:border-orange-500" />
          <input type="password" placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:border-orange-500" />
          {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white py-3 rounded-xl font-medium">
            {loading ? 'Signing in...' : 'Sign in with Firebase'}
          </button>
          <button type="button" onClick={onBack} className="w-full text-sm text-slate-500 hover:text-slate-700">← Back to Store</button>
        </form>
        <div className="mt-6 p-4 bg-blue-50 rounded-xl text-xs text-blue-800">
          <p className="font-semibold mb-1">🔐 Firebase Auth</p>
          <p>Create an admin user in Firebase Console → Authentication → Users → "Add user".</p>
        </div>
      </div>
    </div>
  );
}

function OrdersTab({ orders, onView, onUpdateOrder }: {
  orders: Order[]; onView: (o: Order) => void;
  onUpdateOrder: (id: string, status: Order['status']) => Promise<void>;
}) {
  const [filter, setFilter] = useState<'all' | 'new' | 'confirmed' | 'cancelled'>('all');
  const filtered = useMemo(() => filter === 'all' ? orders : orders.filter(o => o.status === filter), [orders, filter]);
  const counts = useMemo(() => ({
    all: orders.length,
    new: orders.filter(o => o.status === 'new').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  }), [orders]);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(['all', 'new', 'confirmed', 'cancelled'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`bg-white border rounded-2xl p-4 text-left transition ${filter === s ? 'border-orange-500 ring-2 ring-orange-200' : ''}`}>
            <div className="text-xs text-slate-500 uppercase font-semibold">{s === 'all' ? 'Total' : s}</div>
            <div className="text-3xl font-bold mt-1">{counts[s]}</div>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold">Date</th>
                <th className="text-left p-3 font-semibold">Customer</th>
                <th className="text-left p-3 font-semibold">Phone</th>
                <th className="text-left p-3 font-semibold">Address</th>
                <th className="text-left p-3 font-semibold">Product</th>
                <th className="text-left p-3 font-semibold">Qty</th>
                <th className="text-left p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-12 text-center text-slate-400">No orders found.</td></tr>
              ) : filtered.map(order => {
                const date = new Date(order.date);
                return (
                  <tr key={order.id} className="border-b hover:bg-slate-50">
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      <div>{date.toLocaleDateString()}</div>
                      <div className="text-[10px]">{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td className="p-3 font-medium">{order.customerName}</td>
                    <td className="p-3 whitespace-nowrap">{order.mobile}</td>
                    <td className="p-3 max-w-xs"><div className="text-xs whitespace-pre-wrap break-words">{order.address}</div></td>
                    <td className="p-3 text-xs">
                      <div className="font-medium">{order.productName}</div>
                      <div className="text-slate-500">৳{order.productPrice.toLocaleString()}</div>
                    </td>
                    <td className="p-3 text-center">{order.quantity}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                        order.status === 'new' ? 'bg-blue-100 text-blue-700' :
                        order.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-700'
                      }`}>{order.status}</span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex gap-1.5 justify-center">
                        <button onClick={() => onView(order)} className="px-3 py-1 bg-slate-900 text-white text-xs rounded font-medium hover:bg-slate-700">View Details</button>
                        {order.status === 'new' && (
                          <>
                            <button onClick={() => onUpdateOrder(order.id, 'confirmed')} className="px-2 py-1 bg-green-600 text-white text-xs rounded">✓</button>
                            <button onClick={() => onUpdateOrder(order.id, 'cancelled')} className="px-2 py-1 bg-red-600 text-white text-xs rounded">✕</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductsTab({ products, categories, onAdd, onUpdate, onDelete }: {
  products: Product[]; categories: Category[];
  onAdd: (p: Omit<Product, 'id' | 'createdAt'>) => Promise<void>;
  onUpdate: (id: string, updates: Partial<Product>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [modal, setModal] = useState<{ open: boolean; editing: Product | null }>({ open: false, editing: null });
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    if (!filter) return products;
    const q = filter.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, filter]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4 gap-3">
        <input placeholder="Filter products..." value={filter} onChange={e => setFilter(e.target.value)} className="flex-1 max-w-sm border px-4 py-2 rounded-lg text-sm" />
        <button onClick={() => setModal({ open: true, editing: null })} className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg text-sm font-medium whitespace-nowrap">+ Add Product</button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr><th className="p-3 text-left">Product</th><th className="p-3 text-left">Category</th><th className="p-3 text-left">Price</th><th className="p-3 text-left">Stock</th><th className="p-3">Actions</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="p-12 text-center text-slate-400">No products yet. Click "+ Add Product" to start.</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="border-b hover:bg-slate-50">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img src={p.image} alt="" className="w-12 h-12 object-cover rounded bg-gray-100" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-xs text-slate-500 truncate">{p.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap">{p.category}</td>
                  <td className="p-3 font-medium whitespace-nowrap">৳{p.price.toLocaleString()}</td>
                  <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded ${p.stock === 'In Stock' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>{p.stock}</span></td>
                  <td className="p-3 text-center space-x-2 whitespace-nowrap">
                    <button onClick={() => setModal({ open: true, editing: p })} className="text-blue-600 hover:underline text-xs">Edit</button>
                    <button onClick={() => { if (confirm('Delete this product?')) onDelete(p.id); }} className="text-red-600 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal.open && (
        <ProductModal editing={modal.editing} categories={categories}
          onClose={() => setModal({ open: false, editing: null })}
          onSave={async (data) => {
            if (modal.editing) await onUpdate(modal.editing.id, data);
            else await onAdd(data);
            setModal({ open: false, editing: null });
          }} />
      )}
    </div>
  );
}

function ProductModal({ editing, categories, onClose, onSave }: {
  editing: Product | null; categories: Category[];
  onClose: () => void; onSave: (data: Omit<Product, 'id' | 'createdAt'>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: editing?.name || '',
    description: editing?.description || '',
    price: editing?.price || 0,
    category: editing?.category || categories[0]?.name || '',
    stock: editing?.stock || 'In Stock',
    image: editing?.image || '',
  });
  const [saving, setSaving] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setForm({ ...form, image: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-2xl mb-6">{editing ? 'Edit Product' : 'Add New Product'}</h3>
        <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onSave(form); setSaving(false); }} className="space-y-3">
          <input required placeholder="Product Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border px-4 py-3 rounded-xl" />
          <textarea required placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border px-4 py-3 rounded-xl h-20" />
          <div className="grid grid-cols-2 gap-3">
            <input required type="number" min="0" placeholder="Price" value={form.price} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} className="border px-4 py-3 rounded-xl" />
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="border px-4 py-3 rounded-xl" required>
              {categories.length === 0 && <option value="">Create a category first</option>}
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <select value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="w-full border px-4 py-3 rounded-xl">
            <option>In Stock</option><option>Out of Stock</option><option>Limited Stock</option>
          </select>
          <div>
            <label className="text-xs text-slate-500 ml-1">Image (URL or Upload)</label>
            <div className="flex gap-2 mt-1">
              <input placeholder="https://..." value={form.image} onChange={e => setForm({ ...form, image: e.target.value })} className="flex-1 border px-4 py-3 rounded-xl" />
              <label className="bg-slate-100 hover:bg-slate-200 px-4 py-3 rounded-xl cursor-pointer text-sm font-medium">Upload<input type="file" accept="image/*" onChange={handleFile} className="hidden" /></label>
            </div>
            {form.image && <img src={form.image} className="w-24 h-24 mt-2 object-cover rounded" alt="preview" />}
          </div>
          <div className="flex gap-3 pt-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 border rounded-xl hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-medium">
              {saving ? 'Saving...' : (editing ? 'Save Changes' : 'Add Product')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoriesTab({ categories, products, onAdd, onUpdate, onDelete }: {
  categories: Category[]; products: Product[];
  onAdd: (name: string) => Promise<void>;
  onUpdate: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="max-w-3xl">
      <form onSubmit={async (e) => { e.preventDefault(); if (newName.trim()) { await onAdd(newName.trim()); setNewName(''); } }}
        className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
        <h3 className="font-bold mb-3">Add New Category</h3>
        <div className="flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Sports & Fitness" className="flex-1 border px-4 py-2.5 rounded-xl" />
          <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium">Add</button>
        </div>
      </form>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr><th className="text-left p-3">Category Name</th><th className="text-left p-3">Products</th><th className="p-3">Actions</th></tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr><td colSpan={3} className="p-8 text-center text-slate-400">No categories. Add your first above.</td></tr>
            ) : categories.map(cat => {
              const count = products.filter(p => p.category === cat.name).length;
              const isEditing = editing?.id === cat.id;
              return (
                <tr key={cat.id} className="border-b">
                  <td className="p-3">
                    {isEditing ? (
                      <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="border px-3 py-1.5 rounded-lg w-full" />
                    ) : <span className="font-medium">{cat.name}</span>}
                  </td>
                  <td className="p-3 text-slate-500">{count}</td>
                  <td className="p-3 text-center space-x-2 whitespace-nowrap">
                    {isEditing ? (
                      <>
                        <button onClick={async () => { await onUpdate(cat.id, editing.name); setEditing(null); }} className="text-green-600 hover:underline text-xs">Save</button>
                        <button onClick={() => setEditing(null)} className="text-slate-500 hover:underline text-xs">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditing({ id: cat.id, name: cat.name })} className="text-blue-600 hover:underline text-xs">Edit</button>
                        <button onClick={() => { if (count > 0) { alert(`Cannot delete: ${count} products in this category. Move them first.`); return; } if (confirm('Delete this category?')) onDelete(cat.id); }} className="text-red-600 hover:underline text-xs">Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsTab({ settings, onSave, hasAnyData }: {
  settings: WebsiteSettings; onSave: (s: WebsiteSettings) => Promise<void>; hasAnyData: boolean;
}) {
  const [form, setForm] = useState<WebsiteSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [pw, setPw] = useState({ new: '', confirm: '' });
  const [seedStatus, setSeedStatus] = useState<{ loading: boolean; msg: string }>({ loading: false, msg: '' });

  useEffect(() => setForm(settings), [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.new.length < 6) return alert('Password must be at least 6 characters');
    if (pw.new !== pw.confirm) return alert('Passwords do not match');
    try {
      await changeAdminPassword(pw.new);
      setPw({ new: '', confirm: '' });
      alert('Password changed successfully (via Firebase Auth)');
    } catch (err: unknown) {
      alert((err instanceof Error ? err.message : 'Failed to change password') + '\n\nTip: Firebase may require you to sign out and sign back in before changing your password.');
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, field: 'storeLogo' | 'bannerImage') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setForm({ ...form, [field]: reader.result as string });
      reader.readAsDataURL(file);
    }
  };

  const handleSeed = async () => {
    if (!confirm('This will add 10 sample categories and 20 sample products to Firestore. Continue?')) return;
    setSeedStatus({ loading: true, msg: 'Seeding Firestore...' });
    try {
      const result = await seedSampleData();
      setSeedStatus({ loading: false, msg: `✅ Seeded ${result.products} products and ${result.categories} categories.` });
    } catch (err: unknown) {
      setSeedStatus({ loading: false, msg: '❌ ' + (err instanceof Error ? err.message : 'Seed failed') });
    }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase ml-1">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
  const input = "w-full border px-4 py-2.5 rounded-xl focus:outline-none focus:border-orange-500";

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-6">
        <form onSubmit={handleSave} className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">⚙️ Website Settings</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Store Name"><input value={form.storeName} onChange={e => setForm({ ...form, storeName: e.target.value })} className={input} /></Field>
            <Field label="Website Title"><input value={form.websiteTitle} onChange={e => setForm({ ...form, websiteTitle: e.target.value })} className={input} /></Field>
          </div>
          <Field label="Store Logo (Text or URL)">
            <div className="flex gap-2">
              <input value={form.storeLogo} onChange={e => setForm({ ...form, storeLogo: e.target.value })} className={input + ' flex-1'} />
              <label className="bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl cursor-pointer text-sm font-medium">Upload<input type="file" accept="image/*" onChange={e => handleFile(e, 'storeLogo')} className="hidden" /></label>
            </div>
            {(form.storeLogo.startsWith('http') || form.storeLogo.startsWith('data:')) && (
              <img src={form.storeLogo} className="w-16 h-16 mt-2 object-cover rounded" alt="logo" />
            )}
          </Field>
          <Field label="Website Description"><textarea value={form.websiteDescription} onChange={e => setForm({ ...form, websiteDescription: e.target.value })} className={input + ' h-20'} /></Field>
          <div className="pt-4 border-t grid grid-cols-2 gap-3">
            <Field label="Phone Number"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={input} /></Field>
            <Field label="WhatsApp Number"><input value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} className={input} /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={input} /></Field>
            <Field label="Business Address"><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={input} /></Field>
            <Field label="Facebook Page"><input value={form.facebookLink} onChange={e => setForm({ ...form, facebookLink: e.target.value })} className={input} /></Field>
            <Field label="Messenger Link"><input value={form.messengerLink} onChange={e => setForm({ ...form, messengerLink: e.target.value })} className={input} /></Field>
          </div>
          <Field label="Google Maps Embed URL"><textarea value={form.googleMapEmbed} onChange={e => setForm({ ...form, googleMapEmbed: e.target.value })} className={input + ' h-16 text-xs'} /></Field>
          <div className="pt-4 border-t space-y-3">
            <h3 className="font-semibold">Homepage Banner</h3>
            <Field label="Banner Title"><input value={form.bannerTitle} onChange={e => setForm({ ...form, bannerTitle: e.target.value })} className={input} /></Field>
            <Field label="Banner Subtitle"><input value={form.bannerSubtitle} onChange={e => setForm({ ...form, bannerSubtitle: e.target.value })} className={input} /></Field>
            <Field label="Banner Image (URL or Upload)">
              <div className="flex gap-2">
                <input value={form.bannerImage} onChange={e => setForm({ ...form, bannerImage: e.target.value })} className={input + ' flex-1'} placeholder="https://..." />
                <label className="bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-xl cursor-pointer text-sm font-medium">Upload<input type="file" accept="image/*" onChange={e => handleFile(e, 'bannerImage')} className="hidden" /></label>
              </div>
              {form.bannerImage && <img src={form.bannerImage} className="w-full max-w-xs h-24 mt-2 object-cover rounded" alt="banner" />}
            </Field>
          </div>
          <Field label="Footer Text"><input value={form.footerText} onChange={e => setForm({ ...form, footerText: e.target.value })} className={input} /></Field>
          <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-orange-200 mt-2">
            {saved ? '✅ Saved to Firestore' : '💾 Save All Changes'}
          </button>
        </form>
      </div>

      <div className="space-y-6">
        <form onSubmit={handlePasswordChange} className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
          <h2 className="text-xl font-bold flex items-center gap-2">🔒 Change Password</h2>
          <p className="text-xs text-slate-500">Updates your Firebase Auth password.</p>
          <Field label="New Password"><input type="password" required minLength={6} value={pw.new} onChange={e => setPw({ ...pw, new: e.target.value })} className={input} /></Field>
          <Field label="Confirm New Password"><input type="password" required minLength={6} value={pw.confirm} onChange={e => setPw({ ...pw, confirm: e.target.value })} className={input} /></Field>
          <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold mt-2">Change Password</button>
        </form>

        {!hasAnyData && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">🌱 Seed Sample Data</h2>
            <p className="text-xs text-slate-500 mb-3">One-click setup: adds 10 categories and 20 sample products to your Firestore.</p>
            <button onClick={handleSeed} disabled={seedStatus.loading} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-xl font-medium">
              {seedStatus.loading ? 'Seeding...' : 'Seed Sample Data'}
            </button>
            {seedStatus.msg && <p className="text-sm mt-3">{seedStatus.msg}</p>}
          </div>
        )}

        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
          <h3 className="font-bold text-blue-900 mb-2">🔥 Live with Firestore</h3>
          <p className="text-sm text-blue-700 leading-relaxed">
            All data is stored in Firebase Firestore. Orders from any device appear instantly in this dashboard via real-time subscriptions.
          </p>
        </div>
      </div>
    </div>
  );
}
