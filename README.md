# Spam Filter Classes Extension

A thunderbird mail extension providing a configuration interface for an OpenSMTPD mailserver equipped with the `filter-rspamd-class` filter.

The filter-rspamd-class software reads the `X-Spam-Score` header generated by rspamd.  It inserts a 
`X-Spam-Class` header with a class name based on the rspamd score and a configuration table.

This extension adds "Spam Class Thresholds" to Thunderbird's 'Tools" menu and the mail folder context menu.
It interacts with the mailserver by sending and receiving email using the address <filterctl@your-email-domain.org>.

### Requirements:

- The mailserver must be configured for 'filter-rspamd-class' filter and the filterctl email command mechanism.
- This mechanism relies on the Thunderbird mail configuration for authentication and authorization.  The server
should be configured such that only authorized smtps connections from the client are relayed to the filterctl program.

### References:
 - https://www.opensmtpd.org
 - https://rspamd.com
 - https://github.com/rstms/filter-rspamd-class
 - https://github.com/rstms/filterctl
 - https://github.com/rstms/filterctld





