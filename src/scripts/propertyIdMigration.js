// const mongoose = require("mongoose");
// const Property = require("../models/Property"); // correct path

// mongoose.connect("mongodb://pg_hostel:PgHostel%40123@3.108.108.13:27017/pg_hostel?authSource=pg_hostel");

// async function migrate() {
//   const properties = await Property.find().sort({ createdAt: 1 });

//   let counter = 1;

//   for (const property of properties) {
//     await Property.updateOne(
//       { _id: property._id },
//       { $set: { id: counter } }
//     );
//     counter++;
//   }

//   console.log("✅ OLD properties ko idNo mil gaya");
//   process.exit();
// }

// migrate();
