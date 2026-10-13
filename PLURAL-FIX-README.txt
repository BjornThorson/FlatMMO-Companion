FlatMMO Companion — plural item-name fix

Upload all files in this archive to the ROOT of v2-online, replacing matching filenames. Do not upload to main. This is a small replacement patch, not a complete site archive. Leave other site files in place. No manual code edits are needed.

Built from v2-online commit 1924571b1e7b1ad40ac221f8477626796906807c. No GitHub changes were made.

Changes:
- Singular/plural item forms resolve to their canonical records, including orbs, bars, seeds, knives, leaves, staves, axes and numbered orb names.
- Direct item lookup, corrections, exclusions and topic returns use those forms.
- Exact existing names take precedence when singular and plural are separate recorded items.
- Skill names and game mechanics are unchanged. This is grammatical normalization, not a foreign-game alias list.
- Forms are bounded by a curated noun table; arbitrary names are not blindly stripped of their final s. Unlisted irregular forms may still need an additional entry.

Validation: 25 conversation scenarios passed; UI DOM-stub smoke checks passed. No visual browser check was performed for this text-resolution change.
Optional regression command: node conversation-regression.cjs
