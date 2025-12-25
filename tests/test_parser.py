"""Tests for document parser."""

import pytest
from regulatory_kb.processing.parser import (
    DocumentParser,
    DocumentFormat,
    ParsedDocument,
    ParsedSection,
    ParsedTable,
)


class TestDocumentParser:
    """Tests for DocumentParser class."""

    @pytest.fixture
    def parser(self):
        return DocumentParser()

    def test_parse_html_removes_navigation(self, parser):
        """Test that HTML parsing removes navigation elements."""
        html = """
        <html>
        <head><title>Test Regulation</title></head>
        <body>
            <nav>Navigation menu</nav>
            <header>Site header</header>
            <main>
                <h1>Regulation Title</h1>
                <p>This is the main regulatory content about compliance requirements.</p>
            </main>
            <footer>Site footer</footer>
        </body>
        </html>
        """
        result = parser.parse(html, DocumentFormat.HTML)

        assert "Navigation menu" not in result.text
        assert "Site header" not in result.text
        assert "Site footer" not in result.text
        assert "Regulation Title" in result.text
        assert "regulatory content" in result.text

    def test_parse_html_extracts_sections(self, parser):
        """Test that HTML parsing extracts sections from headings."""
        html = """
        <html><body>
            <h1>Main Title</h1>
            <p>Introduction paragraph.</p>
            <h2>Section One</h2>
            <p>Content for section one about reporting requirements.</p>
            <h2>Section Two</h2>
            <p>Content for section two about compliance deadlines.</p>
        </body></html>
        """
        result = parser.parse(html, DocumentFormat.HTML)

        assert len(result.sections) >= 2
        section_titles = [s.title for s in result.sections]
        assert "Section One" in section_titles or "Main Title" in section_titles

    def test_parse_html_extracts_tables(self, parser):
        """Test that HTML parsing extracts tables."""
        html = """
        <html><body>
            <h1>Reporting Requirements</h1>
            <table>
                <caption>Filing Deadlines</caption>
                <thead>
                    <tr><th>Form</th><th>Deadline</th><th>Frequency</th></tr>
                </thead>
                <tbody>
                    <tr><td>FR Y-14A</td><td>April 5</td><td>Annual</td></tr>
                    <tr><td>FR Y-9C</td><td>30 days</td><td>Quarterly</td></tr>
                </tbody>
            </table>
        </body></html>
        """
        result = parser.parse(html, DocumentFormat.HTML)

        assert len(result.tables) == 1
        table = result.tables[0]
        assert table.caption == "Filing Deadlines"
        assert "Form" in table.headers
        assert len(table.rows) == 2

    def test_parse_cfr_extracts_sections(self, parser):
        """Test that CFR parsing extracts section structure."""
        cfr_text = """
        § 249.1 Purpose and applicability.
        (a) This part establishes minimum liquidity requirements for certain
        banking organizations.
        (b) The requirements apply to covered companies as defined in this part.

        § 249.2 Definitions.
        (a) Covered company means a bank holding company with total consolidated
        assets of $250 billion or more.
        (b) High-quality liquid assets means assets that meet the criteria in
        section 249.20.
        """
        result = parser.parse(cfr_text, DocumentFormat.CFR)

        assert len(result.sections) == 2
        assert result.sections[0].number == "§ 249.1"
        assert "Purpose" in result.sections[0].title
        assert len(result.sections[0].subsections) >= 2

    def test_parse_federal_register_extracts_metadata(self, parser):
        """Test that Federal Register parsing extracts metadata."""
        fr_text = """
        AGENCY: Federal Reserve System.

        ACTION: Final rule.

        EFFECTIVE DATE: January 1, 2024.

        OMB Control Number: 7100-0341

        SUMMARY: The Board of Governors of the Federal Reserve System is
        adopting amendments to Regulation YY to implement requirements.
        """
        result = parser.parse(fr_text, DocumentFormat.FEDERAL_REGISTER)

        assert result.metadata.get("agency") == "Federal Reserve System."
        assert result.metadata.get("action") == "Final rule."
        assert "January 1, 2024" in result.metadata.get("effective_date", "")
        assert result.metadata.get("omb_control_number") == "7100-0341"

    def test_parse_fintrac_extracts_timing(self, parser):
        """Test that FINTRAC parsing extracts timing requirements."""
        fintrac_html = """
        <html><body>
            <main>
                <h1>Reporting large cash transactions to FINTRAC</h1>
                <p>You must report large cash transactions of C$10,000 or more
                within 15 days of the transaction.</p>
                <p>Electronic funds transfers must be reported within 5 business days.</p>
            </main>
        </body></html>
        """
        result = parser.parse(fintrac_html, DocumentFormat.FINTRAC)

        assert "C$10,000" in result.metadata.get("thresholds", [])
        timing = result.metadata.get("timing_requirements", [])
        assert any("15" in t for t in timing)
        assert any("5 business" in t for t in timing)

    def test_validate_regulatory_content_passes(self, parser):
        """Test validation passes for regulatory content."""
        parsed = ParsedDocument(
            text="This regulation establishes compliance requirements for filing "
                 "reports. The deadline for submission is quarterly. See CFR section 249.",
            format=DocumentFormat.HTML,
        )
        assert parser.validate_regulatory_content(parsed) is True

    def test_validate_regulatory_content_fails_no_keywords(self, parser):
        """Test validation fails for non-regulatory content."""
        parsed = ParsedDocument(
            text="This is a recipe for chocolate cake. Mix flour and sugar.",
            format=DocumentFormat.HTML,
        )
        assert parser.validate_regulatory_content(parsed) is False
        assert len(parsed.warnings) > 0

    def test_validate_regulatory_content_fails_short_content(self, parser):
        """Test validation fails for short content."""
        parsed = ParsedDocument(
            text="Short text",
            format=DocumentFormat.HTML,
        )
        assert parser.validate_regulatory_content(parsed) is False


class TestParsedSection:
    """Tests for ParsedSection dataclass."""

    def test_to_dict(self):
        section = ParsedSection(
            number="1.1",
            title="Test Section",
            content="Section content",
            level=2,
            subsections=[
                ParsedSection(number="1.1.1", title="Subsection", content="Sub content", level=3)
            ],
        )
        result = section.to_dict()

        assert result["number"] == "1.1"
        assert result["title"] == "Test Section"
        assert len(result["subsections"]) == 1


class TestParsedTable:
    """Tests for ParsedTable dataclass."""

    def test_to_dict(self):
        table = ParsedTable(
            headers=["Col1", "Col2"],
            rows=[["A", "B"], ["C", "D"]],
            caption="Test Table",
        )
        result = table.to_dict()

        assert result["headers"] == ["Col1", "Col2"]
        assert len(result["rows"]) == 2
        assert result["caption"] == "Test Table"
