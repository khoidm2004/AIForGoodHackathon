import app from "./app";
import { config } from "./config";

const port = Number(config.PORT);
app.listen(port, () => {
  console.log(`Server running on port ${port} in ${config.NODE_ENV} mode`);
});
