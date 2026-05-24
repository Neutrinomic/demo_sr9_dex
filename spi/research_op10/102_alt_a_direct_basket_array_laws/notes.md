# Notes

This alternative originally also considered direct basket DTO-array laws. That
was not promoted because SPI-102 still needs projection keys and trusted finite
basket scans for generic `BasketEntry` arrays.

The promoted part is deliberately simpler: caller wrappers over existing quote
and execute laws.

