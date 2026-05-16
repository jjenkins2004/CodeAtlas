import { Router } from "express";
import repositoriesRouter from "./repositories.js";
import symbolsRouter from "./symbols.js";
import providersRouter from "./providers.js";
import searchRouter from "./search.js";
import systemRouter from "./system.js";

const router = Router();

router.use("/repositories", repositoriesRouter);
router.use("/symbols", symbolsRouter);
router.use("/providers", providersRouter);
router.use("/search", searchRouter);
router.use("/system", systemRouter);

export default router;
