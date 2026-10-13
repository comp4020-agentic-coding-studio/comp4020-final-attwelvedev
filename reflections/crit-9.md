# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was a change to `/brainstorm-feature`: it can now dispatch a subagent that follows the `frontend-design` skill and returns a design proposal with wireframes before any code exists. I read the proposal, change it, and send my feedback back to the same subagent to redesign. This is how ideation works without an agent: someone drafts, I react, and they revise. It happens while changing an idea is still cheap.

It shows in the spec. The proposal's filled and hollow pip row didn't read, so I replaced it with an arrow list of who receives each message. I also removed a secret layer for Can't speak. The first build already had a considered look, which my earlier prototypes in this course only reached after several rounds of fixing a generic one. In the first playtest, my friend said nothing ever looked ugly.

The same playtest showed what the process didn't catch. The comms sheets covered the map and "Say, Sound, Show" confused two of us. A rigorous design is not the same as a usable one.

## What did this work change about who I want to be as a software developer?

I want to be a developer who puts rigour at the cheapest point to change: the spec, the wireframe and the rule in the harness, before the code. The agent can produce a design, but whether it fits the people who will use it is still my call.

That also means I need to be clear about what each check can show. A proposal can look right and a playtest can still disprove it, so I want to keep real people in the loop and log what they found.
