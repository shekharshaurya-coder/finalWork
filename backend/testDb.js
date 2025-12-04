const connectDB = require("./db");

connectDB()
  .then(() => console.log("Done!"))
  .catch((err) => console.error(err));
