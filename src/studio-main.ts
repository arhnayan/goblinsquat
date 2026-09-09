import { bootCatalog } from "./game/catalog";
import { mountStudio } from "./game/studio";
import { applyCssVars } from "./game/theme";

applyCssVars();
bootCatalog();

const root = document.getElementById("studio");
if (!root) throw new Error("missing #studio");
mountStudio(root);
