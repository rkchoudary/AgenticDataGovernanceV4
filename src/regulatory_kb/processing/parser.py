"""Document parser for multiple formats including PDF, HTML, and CFR sections.

Implements Requirements 7.1-7.5:
- PDF text extraction with structure preservation
- HTML content extraction with navigation removal
- CFR section parsing with regulatory structure preservation
- Federal Register notice parsing
- FINTRAC web page parsing
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from io import BytesIO
from typing import Optional

import structlog
from bs4 import BeautifulSoup, NavigableString, Tag
from PyPDF2 import PdfReader

from regulatory_kb.core.errors import DocumentParsingError

logger = structlog.get_logger(__name__)


class DocumentFormat(str, Enum):
    """Supported document formats."""

    PDF = "pdf"
    HTML = "html"
    CFR = "cfr"
    FEDERAL_REGISTER = "federal_register"
    FINTRAC = "fintrac"


@dataclass
class ParsedSection:
    """Represents a parsed section from a document."""

    number: str
    title: str
    content: str
    level: int = 1
    subsections: list["ParsedSection"] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {
            "number": self.number,
            "title": self.title,
            "content": self.content,
            "level": self.level,
            "subsections": [s.to_dict() for s in self.subsections],
        }


@dataclass
class ParsedTable:
    """Represents an extracted table from a document."""

    headers: list[str]
    rows: list[list[str]]
    caption: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {
            "headers": self.headers,
            "rows": self.rows,
            "caption": self.caption,
        }


@dataclass
class ParsedDocument:
    """Result of document parsing."""

    text: str
    sections: list[ParsedSection] = field(default_factory=list)
    tables: list[ParsedTable] = field(default_factory=list)
    format: DocumentFormat = DocumentFormat.PDF
    metadata: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {
            "text": self.text,
            "sections": [s.to_dict() for s in self.sections],
            "tables": [t.to_dict() for t in self.tables],
            "format": self.format.value,
            "metadata": self.metadata,
            "warnings": self.warnings,
        }


class DocumentParser:
    """Parser for regulatory documents in multiple formats.

    Supports PDF, HTML, CFR sections, Federal Register notices, and FINTRAC pages.
    """

    # Regulatory keywords for validation
    REGULATORY_KEYWORDS = [
        "regulation", "requirement", "compliance", "reporting", "filing",
        "deadline", "threshold", "cfr", "section", "subsection", "paragraph",
        "effective", "amendment", "rule", "guidance", "instruction",
    ]

    # Navigation elements to remove from HTML
    NAV_ELEMENTS = ["nav", "header", "footer", "aside", "script", "style", "noscript"]
    NAV_CLASSES = ["navigation", "nav", "menu", "sidebar", "footer", "header", "breadcrumb"]

    def __init__(self):
        """Initialize the document parser."""
        self._section_patterns = self._compile_section_patterns()

    def _compile_section_patterns(self) -> dict:
        """Compile regex patterns for section detection."""
        return {
            "cfr_section": re.compile(
                r"§\s*(\d+(?:\.\d+)*)\s+(.+?)(?=\n|$)", re.MULTILINE
            ),
            "cfr_subsection": re.compile(
                r"\(([a-z]|\d+)\)\s*(.+?)(?=\n\(|\n\n|$)", re.MULTILINE | re.DOTALL
            ),
            "heading": re.compile(
                r"^(?:PART|SUBPART|CHAPTER|SECTION|ARTICLE)\s+(\d+[A-Z]?(?:\.\d+)*)\s*[:\-—]?\s*(.+?)$",
                re.MULTILINE | re.IGNORECASE
            ),
            "numbered_section": re.compile(
                r"^(\d+(?:\.\d+)*)\s+(.+?)$", re.MULTILINE
            ),
            "form_field": re.compile(
                r"(?:Line|Item|Field|Schedule)\s+(\d+[A-Za-z]?(?:\.\d+)?)\s*[:\-]?\s*(.+?)(?=\n|$)",
                re.IGNORECASE
            ),
        }

    def parse(
        self,
        content: bytes | str,
        format: DocumentFormat,
        document_id: Optional[str] = None,
    ) -> ParsedDocument:
        """Parse a document based on its format.

        Args:
            content: Document content (bytes for PDF, str for HTML/text)
            format: Document format type
            document_id: Optional document identifier for logging

        Returns:
            ParsedDocument with extracted text, sections, and tables

        Raises:
            DocumentParsingError: If parsing fails
        """
        logger.info("parsing_document", format=format.value, document_id=document_id)

        try:
            if format == DocumentFormat.PDF:
                return self._parse_pdf(content, document_id)
            elif format == DocumentFormat.HTML:
                return self._parse_html(content, document_id)
            elif format == DocumentFormat.CFR:
                return self._parse_cfr(content, document_id)
            elif format == DocumentFormat.FEDERAL_REGISTER:
                return self._parse_federal_register(content, document_id)
            elif format == DocumentFormat.FINTRAC:
                return self._parse_fintrac(content, document_id)
            else:
                raise DocumentParsingError(
                    f"Unsupported document format: {format}",
                    document_id=document_id,
                    document_type=format.value,
                )
        except DocumentParsingError:
            raise
        except Exception as e:
            logger.error("parsing_failed", error=str(e), document_id=document_id)
            raise DocumentParsingError(
                f"Failed to parse document: {str(e)}",
                document_id=document_id,
                document_type=format.value,
            )

    def _parse_pdf(
        self, content: bytes, document_id: Optional[str] = None
    ) -> ParsedDocument:
        """Parse PDF document with structure preservation.

        Implements Requirement 7.1: Extract text content while preserving
        section headings and structure.
        """
        if isinstance(content, str):
            content = content.encode("utf-8")

        pdf_file = BytesIO(content)
        reader = PdfReader(pdf_file)

        text_parts = []
        sections = []
        tables = []
        warnings = []

        for page_num, page in enumerate(reader.pages, 1):
            try:
                page_text = page.extract_text() or ""
                text_parts.append(page_text)

                # Extract sections from page
                page_sections = self._extract_sections(page_text)
                sections.extend(page_sections)

                # Extract tables from page
                page_tables = self._extract_tables_from_text(page_text)
                tables.extend(page_tables)

            except Exception as e:
                warning = f"Failed to extract page {page_num}: {str(e)}"
                warnings.append(warning)
                logger.warning("page_extraction_failed", page=page_num, error=str(e))

        full_text = "\n\n".join(text_parts)

        return ParsedDocument(
            text=full_text,
            sections=sections,
            tables=tables,
            format=DocumentFormat.PDF,
            metadata={"page_count": len(reader.pages)},
            warnings=warnings,
        )


    def _parse_html(
        self, content: str | bytes, document_id: Optional[str] = None
    ) -> ParsedDocument:
        """Parse HTML document with navigation removal.

        Implements Requirement 7.2: Extract main content while removing
        navigation and formatting elements.
        """
        if isinstance(content, bytes):
            content = content.decode("utf-8", errors="replace")

        soup = BeautifulSoup(content, "html.parser")

        # Remove navigation and non-content elements
        for element in self.NAV_ELEMENTS:
            for tag in soup.find_all(element):
                tag.decompose()

        # Remove elements with navigation-related classes
        for class_name in self.NAV_CLASSES:
            for tag in soup.find_all(class_=re.compile(class_name, re.IGNORECASE)):
                tag.decompose()

        # Extract main content
        main_content = soup.find("main") or soup.find("article") or soup.find("body") or soup

        # Extract text preserving structure
        text = self._extract_text_with_structure(main_content)

        # Extract sections from headings
        sections = self._extract_html_sections(main_content)

        # Extract tables
        tables = self._extract_html_tables(main_content)

        return ParsedDocument(
            text=text,
            sections=sections,
            tables=tables,
            format=DocumentFormat.HTML,
            metadata={"title": soup.title.string if soup.title else None},
            warnings=[],
        )

    def _parse_cfr(
        self, content: str | bytes, document_id: Optional[str] = None
    ) -> ParsedDocument:
        """Parse CFR sections with regulatory structure preservation.

        Implements Requirement 7.3: Preserve section numbers, subsection
        structure, and regulatory citations.
        """
        if isinstance(content, bytes):
            content = content.decode("utf-8", errors="replace")

        # Check if HTML content (from eCFR)
        if "<html" in content.lower() or "<body" in content.lower():
            soup = BeautifulSoup(content, "html.parser")
            # Remove navigation
            for element in self.NAV_ELEMENTS:
                for tag in soup.find_all(element):
                    tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
        else:
            text = content

        sections = []
        warnings = []

        # Extract CFR sections using pattern
        section_pattern = self._section_patterns["cfr_section"]
        for match in section_pattern.finditer(text):
            section_num = match.group(1)
            section_title = match.group(2).strip()

            # Find section content (until next section or end)
            start = match.end()
            next_match = section_pattern.search(text, start)
            end = next_match.start() if next_match else len(text)
            section_content = text[start:end].strip()

            # Extract subsections
            subsections = self._extract_cfr_subsections(section_content)

            sections.append(ParsedSection(
                number=f"§ {section_num}",
                title=section_title,
                content=section_content,
                level=1,
                subsections=subsections,
            ))

        # Extract cross-references
        cross_refs = self._extract_cross_references(text)

        return ParsedDocument(
            text=text,
            sections=sections,
            tables=[],
            format=DocumentFormat.CFR,
            metadata={"cross_references": cross_refs},
            warnings=warnings,
        )

    def _parse_federal_register(
        self, content: str | bytes, document_id: Optional[str] = None
    ) -> ParsedDocument:
        """Parse Federal Register notices.

        Implements Requirement 7.4: Extract effective dates, OMB control
        numbers, and regulatory impact information.
        """
        if isinstance(content, bytes):
            content = content.decode("utf-8", errors="replace")

        # Handle HTML content
        if "<html" in content.lower() or "<body" in content.lower():
            soup = BeautifulSoup(content, "html.parser")
            for element in self.NAV_ELEMENTS:
                for tag in soup.find_all(element):
                    tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
        else:
            text = content

        metadata = {}

        # Extract effective date
        effective_pattern = re.compile(
            r"EFFECTIVE\s+DATE[S]?\s*:\s*(.+?)(?=\n[A-Z]|\n\n|$)",
            re.IGNORECASE | re.DOTALL
        )
        match = effective_pattern.search(text)
        if match:
            metadata["effective_date"] = match.group(1).strip()

        # Extract OMB control number
        omb_pattern = re.compile(r"OMB\s+(?:Control\s+)?(?:No\.|Number)[:\s]*(\d{4}-\d{4})", re.IGNORECASE)
        match = omb_pattern.search(text)
        if match:
            metadata["omb_control_number"] = match.group(1)

        # Extract agency
        agency_pattern = re.compile(r"AGENCY\s*:\s*(.+?)(?=\n[A-Z]|\n\n|$)", re.IGNORECASE)
        match = agency_pattern.search(text)
        if match:
            metadata["agency"] = match.group(1).strip()

        # Extract action type
        action_pattern = re.compile(r"ACTION\s*:\s*(.+?)(?=\n[A-Z]|\n\n|$)", re.IGNORECASE)
        match = action_pattern.search(text)
        if match:
            metadata["action"] = match.group(1).strip()

        # Extract sections
        sections = self._extract_sections(text)

        return ParsedDocument(
            text=text,
            sections=sections,
            tables=[],
            format=DocumentFormat.FEDERAL_REGISTER,
            metadata=metadata,
            warnings=[],
        )


    def _parse_fintrac(
        self, content: str | bytes, document_id: Optional[str] = None
    ) -> ParsedDocument:
        """Parse FINTRAC web pages.

        Implements Requirement 7.5: Extract main guidance content while
        preserving examples and timing requirements.
        """
        if isinstance(content, bytes):
            content = content.decode("utf-8", errors="replace")

        soup = BeautifulSoup(content, "html.parser")

        # Remove navigation elements
        for element in self.NAV_ELEMENTS:
            for tag in soup.find_all(element):
                tag.decompose()

        # FINTRAC-specific: remove government header/footer
        for tag in soup.find_all(class_=re.compile(r"gc-|wb-", re.IGNORECASE)):
            if any(nav in str(tag.get("class", [])).lower() for nav in ["nav", "menu", "header", "footer"]):
                tag.decompose()

        # Extract main content
        main = soup.find("main") or soup.find(id="wb-cont") or soup.find("article") or soup

        text = self._extract_text_with_structure(main)
        sections = self._extract_html_sections(main)
        tables = self._extract_html_tables(main)

        metadata = {}

        # Extract timing requirements (e.g., "within 5 business days")
        timing_pattern = re.compile(
            r"within\s+(\d+)\s+(business\s+)?days?",
            re.IGNORECASE
        )
        timings = timing_pattern.findall(text)
        if timings:
            metadata["timing_requirements"] = [
                f"{t[0]} {'business ' if t[1] else ''}days" for t in timings
            ]

        # Extract threshold amounts (e.g., "C$10,000")
        threshold_pattern = re.compile(r"C?\$[\d,]+(?:\.\d{2})?")
        thresholds = threshold_pattern.findall(text)
        if thresholds:
            metadata["thresholds"] = list(set(thresholds))

        # Extract last modified date
        modified = soup.find("time", {"property": "dateModified"})
        if modified:
            metadata["last_modified"] = modified.get("datetime") or modified.get_text()

        return ParsedDocument(
            text=text,
            sections=sections,
            tables=tables,
            format=DocumentFormat.FINTRAC,
            metadata=metadata,
            warnings=[],
        )

    def _extract_text_with_structure(self, element: Tag) -> str:
        """Extract text from HTML while preserving structure."""
        if element is None:
            return ""

        parts = []
        for child in element.children:
            if isinstance(child, NavigableString):
                text = str(child).strip()
                if text:
                    parts.append(text)
            elif isinstance(child, Tag):
                if child.name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
                    parts.append(f"\n\n{child.get_text(strip=True)}\n")
                elif child.name in ["p", "div"]:
                    text = child.get_text(strip=True)
                    if text:
                        parts.append(f"\n{text}")
                elif child.name in ["ul", "ol"]:
                    for li in child.find_all("li", recursive=False):
                        parts.append(f"\n• {li.get_text(strip=True)}")
                elif child.name == "table":
                    parts.append("\n[TABLE]\n")
                else:
                    text = child.get_text(strip=True)
                    if text:
                        parts.append(text)

        return " ".join(parts).strip()

    def _extract_sections(self, text: str) -> list[ParsedSection]:
        """Extract sections from text using heading patterns."""
        sections = []

        # Try numbered section pattern
        pattern = self._section_patterns["numbered_section"]
        for match in pattern.finditer(text):
            section_num = match.group(1)
            section_title = match.group(2).strip()

            # Find content until next section
            start = match.end()
            next_match = pattern.search(text, start)
            end = next_match.start() if next_match else min(start + 2000, len(text))
            content = text[start:end].strip()[:1000]  # Limit content length

            sections.append(ParsedSection(
                number=section_num,
                title=section_title,
                content=content,
                level=section_num.count(".") + 1,
            ))

        return sections

    def _extract_html_sections(self, element: Tag) -> list[ParsedSection]:
        """Extract sections from HTML headings."""
        sections = []

        for heading in element.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
            level = int(heading.name[1])
            title = heading.get_text(strip=True)

            # Get content following the heading
            content_parts = []
            for sibling in heading.find_next_siblings():
                if sibling.name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
                    break
                text = sibling.get_text(strip=True)
                if text:
                    content_parts.append(text)
                if len(" ".join(content_parts)) > 1000:
                    break

            sections.append(ParsedSection(
                number=str(len(sections) + 1),
                title=title,
                content=" ".join(content_parts)[:1000],
                level=level,
            ))

        return sections

    def _extract_cfr_subsections(self, content: str) -> list[ParsedSection]:
        """Extract CFR subsections from section content."""
        subsections = []
        pattern = self._section_patterns["cfr_subsection"]

        for match in pattern.finditer(content):
            subsection_id = match.group(1)
            subsection_content = match.group(2).strip()

            subsections.append(ParsedSection(
                number=f"({subsection_id})",
                title="",
                content=subsection_content[:500],
                level=2,
            ))

        return subsections


    def _extract_tables_from_text(self, text: str) -> list[ParsedTable]:
        """Extract tables from text-based content (PDF)."""
        tables = []

        # Simple table detection: look for aligned columns
        lines = text.split("\n")
        table_lines = []
        in_table = False

        for line in lines:
            # Detect table-like structure (multiple spaces or tabs between values)
            if re.search(r"\s{3,}|\t", line) and len(line.split()) >= 2:
                in_table = True
                table_lines.append(line)
            elif in_table and line.strip():
                table_lines.append(line)
            elif in_table and not line.strip():
                if len(table_lines) >= 2:
                    table = self._parse_text_table(table_lines)
                    if table:
                        tables.append(table)
                table_lines = []
                in_table = False

        # Handle remaining table lines
        if table_lines and len(table_lines) >= 2:
            table = self._parse_text_table(table_lines)
            if table:
                tables.append(table)

        return tables

    def _parse_text_table(self, lines: list[str]) -> Optional[ParsedTable]:
        """Parse a text-based table into structured format."""
        if not lines:
            return None

        # Split first line as headers
        headers = [h.strip() for h in re.split(r"\s{2,}|\t", lines[0]) if h.strip()]
        if len(headers) < 2:
            return None

        rows = []
        for line in lines[1:]:
            cells = [c.strip() for c in re.split(r"\s{2,}|\t", line) if c.strip()]
            if cells:
                # Pad or truncate to match header count
                while len(cells) < len(headers):
                    cells.append("")
                rows.append(cells[:len(headers)])

        if not rows:
            return None

        return ParsedTable(headers=headers, rows=rows)

    def _extract_html_tables(self, element: Tag) -> list[ParsedTable]:
        """Extract tables from HTML content."""
        tables = []

        for table in element.find_all("table"):
            headers = []
            rows = []
            caption = None

            # Get caption
            caption_tag = table.find("caption")
            if caption_tag:
                caption = caption_tag.get_text(strip=True)

            # Get headers from thead or first row
            thead = table.find("thead")
            if thead:
                for th in thead.find_all(["th", "td"]):
                    headers.append(th.get_text(strip=True))
            else:
                first_row = table.find("tr")
                if first_row:
                    for cell in first_row.find_all(["th", "td"]):
                        headers.append(cell.get_text(strip=True))

            # Get data rows
            tbody = table.find("tbody") or table
            for tr in tbody.find_all("tr"):
                # Skip header row if no thead
                if not thead and tr == table.find("tr"):
                    continue
                cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
                if cells:
                    rows.append(cells)

            if headers or rows:
                tables.append(ParsedTable(
                    headers=headers,
                    rows=rows,
                    caption=caption,
                ))

        return tables

    def _extract_cross_references(self, text: str) -> list[str]:
        """Extract regulatory cross-references from text."""
        refs = set()

        # CFR references
        cfr_pattern = re.compile(r"\d+\s+CFR\s+(?:Part\s+)?\d+(?:\.\d+)*", re.IGNORECASE)
        refs.update(cfr_pattern.findall(text))

        # Section references
        section_pattern = re.compile(r"§\s*\d+(?:\.\d+)*")
        refs.update(section_pattern.findall(text))

        # USC references
        usc_pattern = re.compile(r"\d+\s+U\.?S\.?C\.?\s+§?\s*\d+", re.IGNORECASE)
        refs.update(usc_pattern.findall(text))

        return sorted(refs)

    def _extract_form_fields(self, text: str) -> list[dict]:
        """Extract form field definitions from text."""
        fields = []
        pattern = self._section_patterns["form_field"]

        for match in pattern.finditer(text):
            field_num = match.group(1)
            field_desc = match.group(2).strip()

            fields.append({
                "field_number": field_num,
                "description": field_desc,
            })

        return fields

    def validate_regulatory_content(self, parsed: ParsedDocument) -> bool:
        """Validate that parsed document contains expected regulatory content.

        Implements Requirement 7.7: Validate that extracted text contains
        expected regulatory keywords and structure.
        """
        text_lower = parsed.text.lower()

        # Check for regulatory keywords
        keyword_count = sum(
            1 for kw in self.REGULATORY_KEYWORDS if kw in text_lower
        )

        # Require at least 2 regulatory keywords
        if keyword_count < 2:
            parsed.warnings.append(
                f"Document may not be regulatory content (only {keyword_count} keywords found)"
            )
            return False

        # Check for minimum content length
        if len(parsed.text) < 100:
            parsed.warnings.append("Document content is too short")
            return False

        return True
