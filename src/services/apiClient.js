import axios from "axios";

export const dashboardClient =
  axios.create({

<<<<<<< HEAD
    baseURL:"http://localhost:8087/api",
=======
    baseURL:"/api",
>>>>>>> 47fd8305749638f6762be7f3301ba346fad7fbf0
   // timeout: 30000,
    headers: {
      "Content-Type":
        "application/json"
    }
  });
