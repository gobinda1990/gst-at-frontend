import axios from "axios";

export const dashboardClient =
  axios.create({

    baseURL:"/api",
   // timeout: 30000,
    headers: {
      "Content-Type":
        "application/json"
    }
  });
