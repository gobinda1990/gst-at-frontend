import axios from "axios";

export const dashboardClient =
  axios.create({

    baseURL:"http://localhost:8085/api",
   // timeout: 30000,
    headers: {
      "Content-Type":
        "application/json"
    }
  });