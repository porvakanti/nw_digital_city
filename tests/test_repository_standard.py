"""The repository is a deliverable, and reads like one.

This project was written alongside a programme of work, and its documentation
picked up the vocabulary of that programme: references to a particular session,
to the people involved, to the machine it was being built on, and to the effect
a given detail would have on an audience. None of that belongs in a repository
that will be reviewed inside the organisation. It dates the work, it names
individuals in a codebase whose whole data-handling stance is that individuals
are not named, and it reads as commentary rather than as engineering.

The distinction this module enforces is not "no rationale". A comment
explaining why a technical decision was taken is the most valuable kind of
comment there is, and those are kept. What is refused is the same fact dressed
in occasion: "the client deadline must be shorter than the server's" is
engineering, and the same sentence ending "or a slow answer spoils the demo" is
not.
"""

from __future__ import annotations

import pathlib
import re
import subprocess
import unittest

REPO = pathlib.Path(__file__).resolve().parent.parent

# Generated artefacts and vendored third-party code are excluded: the first is
# derived from a source that legitimately contains owner names, and the second
# is not ours to edit.
#
# This module excludes itself, because the only way to state a rule against a
# word is to write the word down. It went untracked when it was written, so
# `git ls-files` could not see it and the suite passed; committing it made the
# checker fail on its own pattern table.
EXCLUDED = (
    "renderer/vendor/",
    "data/city.json",
    "renderer/city-data.js",
    "tests/test_repository_standard.py",
)

FORBIDDEN: dict[str, tuple[str, str]] = {
    "a named individual": (
        r"\b(Tomas|Kate|Hilmi|Gorkem|Praveen)\b",
        "Name no individual. The derived dataset carries category owners under "
        "the disclosure policy in config/metrics.yaml; nothing else should.",
    ),
    "a reference to one occasion": (
        r"\ball[- ]hands\b|\b\d{3} people\b|\bon the day\b|\bon stage\b"
        r"|\bthe room\b|\bthe venue\b|\bprojector\b|\brehears\w*\b"
        r"|\brun of show\b|\bpresenter\b|\bgiveaway\b|\bthe audience\b"
        r"|\bin front of (you|us|the room|a room|\d)",
        "Describe the behaviour, not the occasion. Documentation outlives any "
        "one session and is read by people who were not at it.",
    ),
    "a personal machine": (
        r"\blaptop\b|\bmy machine\b|\byour machine\b",
        "Say host, local host, workstation or build host. Which hardware "
        "somebody happens to use is not an architectural fact.",
    ),
    "first-person narration": (
        r"(?<![A-Za-z])I (have|had|used|wrote|think|am|will|would|left)\b"
        r"|\bmy own\b|\bI['’]ve\b|\bwe['’]ll\b",
        "Write in the third person. A repository has no narrator.",
    ),
    "narrative filler": (
        r"\bworth (knowing|saying|doing|it)\b|\bthe whole show\b"
        r"|\bthe hero\b|\bdead air\b|\bnobody notices\b"
        r"|\bhave a field day\b|\bsomebody shouts\b|\bwhat the room\b",
        "State the fact. Commentary on how interesting the fact is does not "
        "help a reader and does not survive review.",
    ),
}


def tracked() -> list[pathlib.Path]:
    listing = subprocess.run(
        ["git", "ls-files", "-z"], cwd=REPO, capture_output=True, text=True, check=True
    )
    return [
        REPO / name
        for name in listing.stdout.split("\0")
        if name and not any(part in name for part in EXCLUDED)
    ]


class TestRepositoryStandard(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls):
        cls.files = []
        for path in tracked():
            try:
                cls.files.append((path, path.read_text(encoding="utf-8")))
            except (UnicodeDecodeError, IsADirectoryError, FileNotFoundError):
                continue

    def refuse(self, label: str):
        pattern, why = FORBIDDEN[label]
        found = []
        for path, body in self.files:
            for number, line in enumerate(body.splitlines(), 1):
                if re.search(pattern, line, re.IGNORECASE):
                    where = path.relative_to(REPO)
                    found.append(f"  {where}:{number}  {line.strip()[:96]}")
        if found:
            self.fail(
                f"{len(found)} line(s) contain {label}.\n{why}\n\n"
                + "\n".join(found[:30])
                + ("\n  ..." if len(found) > 30 else "")
            )

    def test_no_individual_is_named(self):
        self.refuse("a named individual")

    def test_nothing_refers_to_a_single_occasion(self):
        self.refuse("a reference to one occasion")

    def test_nothing_refers_to_a_personal_machine(self):
        self.refuse("a personal machine")

    def test_nothing_is_narrated_in_the_first_person(self):
        self.refuse("first-person narration")

    def test_no_narrative_filler(self):
        self.refuse("narrative filler")

    def test_no_em_dashes(self):
        """Punctuation the rest of the repository does not use."""
        found = [
            f"  {path.relative_to(REPO)}:{n}"
            for path, body in self.files
            for n, line in enumerate(body.splitlines(), 1)
            if "—" in line
        ]
        self.assertEqual([], found, "em dash; use a colon, a comma or a full stop")


if __name__ == "__main__":
    unittest.main()
