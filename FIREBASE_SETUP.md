# 🔥 Firebase Setup Guide — Good Price BD

This e-commerce app uses **Firebase Firestore** as its single source of truth and **Firebase Authentication** for admin login. Follow these steps to go live.

## 1. Create a Firebase Project

1. Go to <https://console.firebase.google.com/>
2. Click **Add project** → enter a name (e.g. `good-price-bd`)
3. Disable Google Analytics (optional)
4. Click **Create project**

## 2. Add a Web App

1. In the project dashboard, click the **Web (`</>`)** icon
2. Register the app with a nickname (e.g. `goodprice-web`)
3. **Copy the `firebaseConfig` object** — you'll need it for `.env`
4. Skip "Firebase Hosting" for now

## 3. Enable Cloud Firestore

1. In the left sidebar, click **Build → Firestore Database**
2. Click **Create database**
3. Start in **production mode**
4. Select a region close to your customers (e.g. `asia-south1` for Bangladesh)
5. Click **Enable**

## 4. Configure Firestore Security Rules

Go to **Firestore Database → Rules** and paste:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // PRODUCTS: everyone reads, only admins write
    match /products/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // CATEGORIES: everyone reads, only admins write
    match /categories/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // SETTINGS: everyone reads, only admins write
    match /settings/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // ORDERS: anyone can CREATE (customers placing orders),
    //         only admins can read / update / delete
    match /orders/{doc} {
      allow create: if request.resource.data.keys().hasAll(
        ['customerName', 'mobile', 'address', 'productId', 'quantity', 'status', 'date']
      );
      allow read, update, delete: if request.auth != null;
    }
  }
}
```

Click **Publish**.

> Any authenticated Firebase user is treated as an admin. Only create accounts for trusted staff.

## 5. Enable Authentication

1. Left sidebar → **Build → Authentication**
2. Click **Get started**
3. Under **Sign-in method**, enable **Email/Password**
4. Go to **Users** → **Add user**
5. Enter your admin email + password (≥ 6 chars)

## 6. Add Firebase Config to the App

1. In the project root, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and paste your Firebase config values:
   ```
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=good-price-bd.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=good-price-bd
   VITE_FIREBASE_STORAGE_BUCKET=good-price-bd.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=1:...:web:...
   ```
3. Restart the dev server:
   ```bash
   npm run dev
   ```

## 7. First Login & Seed Data

1. Open the site → click **Admin Portal** (top-right)
2. Sign in with the email/password you created in Firebase Auth
3. Go to **Settings** tab → click **Seed Sample Data** to populate 20 demo products + 10 categories
4. Done! Visit the homepage to see live data.

## 8. Deploy to Production

### Option A — Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting        # choose your project, public dir: dist, SPA: yes
npm run build
firebase deploy
```

### Option B — Vercel

1. Push your repo to GitHub
2. Import the repo in <https://vercel.com>
3. Add your `VITE_FIREBASE_*` env vars in **Project Settings → Environment Variables**
4. Deploy

## 📁 Firestore Database Schema

```
firestore/
├── products (collection)
│   └── {auto-id}
│       ├── name: string
│       ├── description: string
│       ├── price: number
│       ├── category: string         (references categories.name)
│       ├── stock: string            ("In Stock" | "Out of Stock" | "Limited Stock")
│       ├── image: string            (URL or base64)
│       └── createdAt: number        (epoch ms)
│
├── orders (collection)
│   └── {auto-id}
│       ├── productId: string
│       ├── productName: string
│       ├── productImage: string
│       ├── productPrice: number
│       ├── customerName: string
│       ├── mobile: string
│       ├── address: string
│       ├── quantity: number
│       ├── notes: string
│       ├── status: string           ("new" | "confirmed" | "cancelled")
│       └── date: string             (ISO timestamp)
│
├── categories (collection)
│   └── {auto-id}
│       └── name: string
│
└── settings (collection)
    └── main (single doc)
        ├── storeName, storeLogo
        ├── phone, whatsapp, email, address
        ├── facebookLink, messengerLink, googleMapEmbed
        ├── footerText
        ├── websiteTitle, websiteDescription
        ├── bannerTitle, bannerSubtitle, bannerImage
```

## ✅ Verification Checklist

- [ ] Customers can browse products without logging in
- [ ] Orders placed from one device appear instantly in the admin dashboard on another device
- [ ] Admin can add a product → it appears on the homepage immediately
- [ ] Admin can change settings → contact info updates everywhere instantly
- [ ] Logging out and back in preserves all data
- [ ] Opening the site on a different browser shows the same products & settings

## 🆘 Troubleshooting

- **"Firebase Not Configured" screen** → Your `.env` is missing values. Rebuild after editing.
- **"Missing or insufficient permissions"** → Check Firestore Rules (step 4).
- **Can't sign in as admin** → Verify the user exists in Firebase Auth → Users.
- **Password change fails** → Firebase may require recent sign-in. Log out and back in.
