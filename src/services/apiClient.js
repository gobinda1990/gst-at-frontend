import axios from "axios";

export const dashboardClient =
  axios.create({

    baseURL:"http://10.153.43.8:8087/api",
   // timeout: 30000,
    headers: {
      "Content-Type":
        "application/json"
    }
  });
