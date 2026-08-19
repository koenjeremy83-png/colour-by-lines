COLOUR BY LINES — PAYPAL CHECKOUT STARTER

This package changes the Buy & Download buttons from demo alerts into real PayPal order creation.

IMPORTANT:
- It is configured for PayPal Sandbox testing.
- You must create a PayPal Developer app and put its sandbox Client ID and Secret into environment variables.
- Do NOT put the PayPal secret in browser JavaScript.
- The final production version should capture/verify the order on the server before releasing the PDF.
- The current artwork files are PNG previews. Create the final purchased PDF files as page-1.pdf and page-2.pdf in /public before production delivery.

RUN:
1. Install Node.js.
2. Run: npm install
3. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.
4. Run: npm start
5. Open http://localhost:3000

For production, change PAYPAL_BASE_URL to https://api-m.paypal.com and complete server-side capture + secure download delivery.
