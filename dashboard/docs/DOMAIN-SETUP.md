# Custom domain setup (e.g. your .com)

After adding a new domain (e.g. `app.yourdomain.com` or `yourdomain.com`), the site can be “up and down” or show “Invalid token” / broken auth until everything is aligned. Use this checklist.

## 1. Firebase: Authorized domains

Firebase Auth only allows sign-in from domains you explicitly allow. If your new .com is missing, sign-in and token refresh can fail or be inconsistent.

1. Open [Firebase Console](https://console.firebase.google.com) → your project  
2. **Authentication** → **Settings** (or **Sign-in method** tab) → **Authorized domains**  
3. Add your production domain, e.g. `portal.strydeos.com` or `yourdomain.com`  
4. Save

Without this, you may see “Invalid token”, redirect failures, or sign-in working only sometimes (e.g. when a redirect lands on an already-authorized domain).

## 2. Vercel: Environment variables

Set these in [Vercel](https://vercel.com) → your project → **Settings** → **Environment Variables** for **Production** (and Preview if you use a custom preview domain):

- **`NEXT_PUBLIC_APP_URL`** = your canonical app URL, e.g. `https://portal.strydeos.com`  
  - Used for invite/login links and any client-visible links. Must use HTTPS and the exact domain users see.
- **`APP_URL`** = same value, e.g. `https://portal.strydeos.com`  
  - Used for server-side callbacks (e.g. n8n). Must match the domain your app is served from.

Redeploy after changing env vars so the new values are baked into the build/runtime.

## 3. Firebase Auth domain (optional)

`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is usually your Firebase project domain, e.g. `your-project.firebaseapp.com`. You typically **do not** need to change this when adding a custom app domain; Firebase still issues tokens and the backend verifies them. Only change it if you have a specific reason (e.g. custom auth domain in Firebase).

## 4. DNS and SSL (why it’s “up and down”)

- **DNS**: New domains or DNS changes can take **24–72 hours** to propagate. Some users or regions may see the new site, others may see the old one or errors until propagation completes.
- **SSL**: Vercel provisions certificates automatically. Until the domain is correctly pointing at Vercel and the cert is issued, you can get mixed content, “not secure”, or failed requests. Check Vercel → **Settings** → **Domains** for your domain; it should show “Valid” for the certificate.

If the .com is “sometimes working, sometimes not”, wait 24–48h after adding the domain and double-check DNS (A/CNAME) and domain status in Vercel.

## 5. If users still see “Invalid token” or session errors

- Ensure the domain is in Firebase **Authorized domains** (step 1).  
- Ensure **NEXT_PUBLIC_APP_URL** and **APP_URL** in Vercel match the exact URL users use (step 2).  
- Ask the user to sign out and sign in again on the **canonical** URL (the same one you set in env).  
- Check the browser console and network tab for 401 responses; the app will show “Session expired. Please sign in again.” for auth failures.
