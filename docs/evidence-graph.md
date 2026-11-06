# Evidence Graph

Typed nodes record observation status, source, chain, block, timestamp, method, data and limits. Typed edges connect permissions to callbacks, callback source observations, ownership observations and support for deterministic findings. Every displayed finding has nonempty evidence IDs and SUPPORTS_FINDING edges validated by assertEvidence.

The interactive trail selects a finding, lists supporting nodes, opens raw observation details, and allows navigation through every graph node and typed relationship. The selected overview finding opens that same finding in the graph. UNKNOWN, ESTIMATED, SIMULATED and OBSERVED are separate states. Source snippets remain estimated semantic evidence even when the source verification itself is observed.

A matching local simulation is also connected through TESTED_BY and PRODUCED_RESULT edges to its observed balance change and return-delta capability. The historical simulation runtime must match the scanned runtime before those nodes are attached. Inference records are stored separately with execution provenance. They are not automatically independent proof. Missing or contradictory evidence is displayed as a limit; no contradiction is invented simply to fill the graph.
