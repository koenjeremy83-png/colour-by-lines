const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const PRODUCTS = {
  page1: {
    name: "John Deere 8R 250 Tractor",
    price: "1.00"
  },
  page2: {
    name: "John Deere 7R Tractor",
    price: "1.00"
  }
};

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Colour by Lines"
  });
});

app.post("/api/create-order", async (req, res) => {

  try {

    const product = PRODUCTS[req.body.product];

    if (!product) {
      return res.status(400).json({
        error: "Product not found."
      });
    }

    // PayPal has not been connected yet.
    if (
      !process.env.PAYPAL_CLIENT_ID ||
      !process.env.PAYPAL_CLIENT_SECRET
    ) {
      return res.status(503).json({
        error: "PayPal is not connected yet."
      });
    }

    const credentials = Buffer
      .from(
        process.env.PAYPAL_CLIENT_ID +
        ":" +
        process.env.PAYPAL_CLIENT_SECRET
      )
      .toString("base64");

    const base =
      process.env.PAYPAL_BASE_URL ||
      "https://api-m.sandbox.paypal.com";

    const tokenResponse = await fetch(
      base + "/v1/oauth2/token",
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + credentials,
          "Content-Type":
            "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return res.status(502).json({
        error:
          tokenData.error_description ||
          "PayPal authentication failed."
      });
    }

    const orderResponse = await fetch(
      base + "/v2/checkout/orders",
      {
        method: "POST",
        headers: {
          "Authorization":
            "Bearer " + tokenData.access_token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: req.body.product,
              description: product.name,
              amount: {
                currency_code: "USD",
                value: product.price
              }
            }
          ]
        })
      }
    );

    const orderData = await orderResponse.json();

    if (!orderResponse.ok) {
      return res.status(502).json({
        error:
          orderData.message ||
          "PayPal order creation failed."
      });
    }

    const approvalLink =
      orderData.links &&
      orderData.links.find(
        link => link.rel === "approve"
      );

    if (!approvalLink) {
      return res.status(502).json({
        error:
          "PayPal did not return a checkout link."
      });
    }

    return res.json({
      approvalUrl: approvalLink.href,
      orderId: orderData.id
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error:
        "The checkout server encountered an error."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    "Colour by Lines running on port " + PORT
  );
});
