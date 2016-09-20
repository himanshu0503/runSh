#!/bin/bash -e
<% _.each(obj.scripts, function(script) { %>
<%= script %>
<% }); %>
