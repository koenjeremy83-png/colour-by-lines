const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const publicFolder = __dirname;

app.get("/", (req, res) => {
  res.sendFile(path.join(publicFolder, "index.html"));
});

app.use(express.static(publicFolder));

app.get("/health", (req, res) => {
  res.json({ status: "OK", service: "Colour by Lines" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Colour by Lines running on port ${PORT}`);
});
