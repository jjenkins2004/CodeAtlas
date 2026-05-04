import { Router } from "express";
import repositoriesRouter from "./repositories.js";
import symbolsRouter from "./symbols.js";

const router = Router();

router.use("/repositories", repositoriesRouter);
router.use("/symbols", symbolsRouter);

export default router;
