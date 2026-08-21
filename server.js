const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const PRODUCTS = {
  page1: {
    name: "John Deere 8R 250 Tractor",
    price: "1.00",
    file: "page-1-tractor-colouring-page.pdf"
  },

  page2: {
    name: "John Deere 7R Tractor",
    price: "1.00",
    file: "page-2-tractor-colouring-page.pdf"
  }
};

const PAYPAL_BASE =
  process.env.PAYPAL_BASE_URL ||
  "https://api-m.sandbox.paypal.com";

const APP_URL =
  process.env.APP_URL ||
  "https://colour-by-lines-1.onrender.com";

console.log("=================================");
console.log("Colour by Lines starting...");
console.log("PORT:", PORT);
console.log(
  "PayPal Client ID loaded:",
  !!process.env.PAYPAL_CLIENT_ID
);
console.log(
  "PayPal Secret loaded:",
  !!process.env.PAYPAL_CLIENT_SECRET
);
console.log("PayPal Base URL:", PAYPAL_BASE);
console.log("APP URL:", APP_URL);
console.log("=================================");


// HOME
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});


// HEALTH CHECK
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Colour by Lines"
  });
});


// CREATE PAYPAL ORDER
app.post("/api/create-order", async (req, res) => {
  try {

    const productId = req.body.product;
    const product = PRODUCTS[productId];

    if (!product) {
      return res.status(400).json({
        error: "Product not found."
      });
    }

    const clientId =
      process.env.PAYPAL_CLIENT_ID;

    const clientSecret =
      process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {

      console.error(
        "ERROR: PayPal credentials are missing."
      );

      return res.status(500).json({
        error: "PayPal is not configured."
      });
    }

    console.log(
      "Creating PayPal order for:",
      productId
    );

    // PAYPAL AUTHENTICATION

    const auth = Buffer
      .from(`${clientId}:${clientSecret}`)
      .toString("base64");

    const tokenResponse = await fetch(
      `${PAYPAL_BASE}/v1/oauth2/token`,
      {
        method: "POST",

        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          "grant_type=client_credentials"
      }
    );

    const tokenText =
      await tokenResponse.text();

    let tokenData;

    try {
      tokenData = JSON.parse(tokenText);
    } catch (error) {

      console.error(
        "Invalid PayPal token response:",
        tokenText
      );

      return res.status(502).json({
        error:
          "PayPal returned an invalid authentication response."
      });
    }

    if (!tokenResponse.ok) {

      console.error(
        "PayPal authentication failed:",
        tokenData
      );

      return res.status(502).json({
        error:
          "PayPal authentication failed."
      });
    }

    const accessToken =
      tokenData.access_token;


    // CREATE ORDER

    const orderResponse = await fetch(
      `${PAYPAL_BASE}/v2/checkout/orders`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          intent: "CAPTURE",

          purchase_units: [

            {
              // IMPORTANT:
              // This tells PayPal which product was purchased.

              reference_id: productId,

              description:
                product.name,

              amount: {
                currency_code: "USD",

                value:
                  Number(product.price)
                    .toFixed(2)
              }
            }

          ],

          application_context: {

            brand_name:
              "Colour by Lines",

            landing_page:
              "LOGIN",

            user_action:
              "PAY_NOW",

            return_url:
              `${APP_URL}/paypal-success`,

            cancel_url:
              `${APP_URL}/paypal-cancel`
          }

        })
      }
    );


    const orderText =
      await orderResponse.text();

    let orderData;

    try {
      orderData =
        JSON.parse(orderText);
    } catch (error) {

      console.error(
        "Invalid PayPal order response:",
        orderText
      );

      return res.status(502).json({
        error:
          "PayPal returned an invalid order response."
      });
    }


    if (!orderResponse.ok) {

      console.error(
        "PayPal order creation failed:",
        orderData
      );

      return res.status(502).json({

        error:
          orderData?.details?.[0]
            ?.description ||
          "PayPal could not create the order."
      });
    }


    const approvalLink =
      orderData.links?.find(
        link =>
          link.rel === "approve"
      );


    if (!approvalLink) {

      console.error(
        "PayPal approval link missing:",
        orderData
      );

      return res.status(502).json({
        error:
          "PayPal checkout link was not returned."
      });
    }


    console.log(
      "PayPal order created:",
      orderData.id
    );


    return res.json({

      success: true,

      orderId:
        orderData.id,

      approvalUrl:
        approvalLink.href
    });


  } catch (error) {

    console.error(
      "CREATE ORDER ERROR:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to start PayPal checkout."
    });
  }
});


// PAYPAL SUCCESS
app.get(
  "/paypal-success",
  async (req, res) => {

    try {

      const orderId =
        req.query.token;

      if (!orderId) {

        return res.status(400).send(
          "Missing PayPal order ID."
        );
      }


      const clientId =
        process.env.PAYPAL_CLIENT_ID;

      const clientSecret =
        process.env.PAYPAL_CLIENT_SECRET;


      if (!clientId || !clientSecret) {

        return res.status(500).send(
          "PayPal is not configured."
        );
      }


      const auth = Buffer
        .from(`${clientId}:${clientSecret}`)
        .toString("base64");


      // GET ACCESS TOKEN

      const tokenResponse =
        await fetch(
          `${PAYPAL_BASE}/v1/oauth2/token`,
          {
            method: "POST",

            headers: {
              Authorization:
                `Basic ${auth}`,

              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              "grant_type=client_credentials"
          }
        );


      const tokenData =
        await tokenResponse.json();


      if (!tokenResponse.ok) {

        console.error(
          "PayPal authentication failed:",
          tokenData
        );

        return res.status(502).send(
          "PayPal authentication failed."
        );
      }


      // CAPTURE PAYMENT

      const captureResponse =
        await fetch(
          `${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`,
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${tokenData.access_token}`,

              "Content-Type":
                "application/json"
            }
          }
        );


      const captureData =
        await captureResponse.json();


      if (!captureResponse.ok) {

        console.error(
          "PayPal capture failed:",
          captureData
        );

        return res.status(502).send(
          "PayPal payment could not be completed."
        );
      }


      console.log(
        "PayPal payment status:",
        captureData.status
      );


      if (
        captureData.status !==
        "COMPLETED"
      ) {

        return res.status(400).send(`
          <h1>Payment not completed</h1>
          <p>
            PayPal payment status:
            ${captureData.status}
          </p>
          <a href="/">
            Return to Colour by Lines
          </a>
        `);
      }


      // FIND PRODUCT

      const productId =
        captureData
          .purchase_units?.[0]
          ?.reference_id;


      const product =
        PRODUCTS[productId];


      if (!product) {

        console.error(
          "Product not found:",
          productId
        );

        return res.status(400).send(
          "Product could not be identified."
        );
      }


      console.log(
        "Customer purchased:",
        productId
      );


      // SUCCESS PAGE

      res.send(`
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width, initial-scale=1"
>

<title>
Payment Complete | Colour by Lines
</title>

<style>

body {
  font-family: Arial, sans-serif;
  background: #fafaf7;
  color: #202820;
  text-align: center;
  padding: 50px 20px;
}

.box {
  max-width: 600px;
  margin: auto;
  background: white;
  padding: 40px;
  border-radius: 20px;
  border: 1px solid #ddd;
}

.success {
  font-size: 60px;
}

.download {
  display: inline-block;
  margin-top: 25px;
  padding: 16px 28px;
  background: #202820;
  color: white;
  text-decoration: none;
  border-radius: 10px;
  font-weight: bold;
  font-size: 18px;
}

.return {
  display: inline-block;
  margin-top: 25px;
  color: #202820;
}

</style>

</head>

<body>

<div class="box">

<div class="success">
✅
</div>

<h1>
Payment Complete!
</h1>

<p>
Thank you for purchasing from
<strong>Colour by Lines</strong>.
</p>

<p>
<strong>
${product.name}
</strong>
</p>

<p>
Your colouring page is ready.
</p>

<a
class="download"
href="/${product.file}"
download
>
Download Your Colouring Page
</a>

<br>

<a
class="return"
href="/"
>
Return to Colour by Lines
</a>

</div>

</body>

</html>
      `);


    } catch (error) {

      console.error(
        "PayPal success error:",
        error
      );

      return res.status(500).send(
        "There was a problem completing your payment."
      );
    }
  }
);


// PAYPAL CANCEL
app.get(
  "/paypal-cancel",
  (req, res) => {

    res.send(`
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width, initial-scale=1"
>

<title>
Payment Cancelled
</title>

<style>

body {
  font-family: Arial, sans-serif;
  background: #f7f8f4;
  text-align: center;
  padding: 50px 20px;
  color: #202820;
}

.box {
  max-width: 600px;
  margin: auto;
  background: white;
  padding: 40px;
  border-radius: 20px;
}

a {
  display: inline-block;
  margin-top: 20px;
  padding: 14px 25px;
  background: #202820;
  color: white;
  text-decoration: none;
  border-radius: 10px;
  font-weight: bold;
}

</style>

</head>

<body>

<div class="box">

<h1>
Payment Cancelled
</h1>

<p>
No payment was taken.
</p>

<a href="/">
Return to Colour by Lines
</a>

</div>

</body>

</html>
    `);
  }
);


// START SERVER
app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Colour by Lines running on port ${PORT}`
    );

  }
);
