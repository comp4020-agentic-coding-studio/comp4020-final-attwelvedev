# Crit 8 reflection

## What was the breakthrough that moved the work forward?

My starting idea was a pantry tracker: add an item, mark it used or binned. It was useful, but it didn't fit the brief's constraint to design for co-presence, where the app should be more interesting because other people are using it at the same time. A room full of people each tracking their own cupboard isn't that.

The breakthrough was the agent suggesting communities. That pushed me in the right direction, but it wasn't the answer on its own. Taken alone, it would have meant dropping the tracker for a different app. My contribution was to keep the core idea and extend it. Surplus food leaves one household's pantry as an offer, and a neighbouring household can claim it. Tracking is what makes an offer possible, and the offers are what make other people's presence matter. Households sharing a pantry and live offers between them are the same app.

That is the gap I think the app fills. Pantry trackers handle one household and neighbourhood sharing apps handle strangers' leftovers. Little connects the two, and the connection is where food actually gets saved.

## What did this work change about who I want to be as a software developer?

*[Draft for you to rewrite. Only keep what is true for you.]*

The agent supplied a direction, and I supplied the judgement about how it fit what I already had. I don't want to be the developer who is best at producing ideas or code. I want to be the one who can say where an idea fits, what it should not become, and what is worth keeping. Two moments show it. The plan said later offers should post in one tap with the first note kept as a default, and every check passed. Using the app, I saw that a pickup note describes one item ("left of the green door, after 6"), so a remembered default would usually be wrong. I changed the rule so every Offer opens the note sheet prefilled. And when the "new member shows within 1000 ms" spec failed, I measured the member appearing at about 580 ms before touching anything. The app was fine, so I fixed the locator and left the bound alone. In both cases the agent's output was plausible and I decided from evidence whether it was right.
