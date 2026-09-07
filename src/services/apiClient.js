import axios from "axios";

export const dashboardClient =
  axios.create({

    baseURL:"/api/gst/return-3b",
   // timeout: 30000,
    headers: {
      "Content-Type":
        "application/json"
    }
  });
