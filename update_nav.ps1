# update_nav.ps1 — rewrites nav-links on every inner page
# Nav order: About | Culture & Heritage | Leadership | Entertainment | Elections | Contact | Join Us

$base = 'D:\Desktop\Oron Union'

function Build-Nav($active) {
  $a  = if ($active -eq 'about')         { ' aria-current="page"' } else { '' }
  $c  = if ($active -eq 'culture')       { ' aria-current="page"' } else { '' }
  $l  = if ($active -eq 'leadership')    { ' aria-current="page"' } else { '' }
  $e  = if ($active -eq 'entertainment') { ' aria-current="page"' } else { '' }
  $el = if ($active -eq 'elections')     { ' aria-current="page"' } else { '' }
  $co = if ($active -eq 'contact')       { ' aria-current="page"' } else { '' }
  $j  = if ($active -eq 'join')          { ' aria-current="page"' } else { '' }

  return @"
<ul class="nav-links" id="nav-links">
      <li><a href="about.html"$a>About <svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4,6 8,10 12,6"/></svg></a>
        <ul class="dropdown">
          <li><a href="about.html#history">History</a></li>
          <li><a href="about.html#mission">Mission &amp; Vision</a></li>
          <li><a href="about.html#values">Core Values</a></li>
          <li><a href="about.html#constitution">Constitution</a></li>
          <li><a href="leadership.html#past">Past Leadership</a></li>
          <li><a href="projects.html">Projects</a></li>
        </ul>
      </li>
      <li><a href="culture.html"$c>Culture &amp; Heritage <svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4,6 8,10 12,6"/></svg></a>
        <ul class="dropdown">
          <li><a href="culture.html#history">History of Oron People</a></li>
          <li><a href="culture.html#clans">Our Nine Clans</a></li>
          <li><a href="culture.html#language">Language</a></li>
          <li><a href="culture.html#festivals">Festivals &amp; Ceremonies</a></li>
          <li><a href="culture.html#arts">Arts &amp; Crafts</a></li>
          <li><a href="culture.html#folklore">Folklore &amp; Traditions</a></li>
          <li><a href="culture.html#gallery">Photo Gallery</a></li>
        </ul>
      </li>
      <li><a href="leadership.html"$l>Leadership <svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4,6 8,10 12,6"/></svg></a>
        <ul class="dropdown">
          <li><a href="leadership.html#executive">Central Executive Committee</a></li>
          <li><a href="leadership.html#trustees">Board of Trustees</a></li>
          <li><a href="leadership.html#cotr">Council of Oro Traditional Rulers</a></li>
          <li><a href="leadership.html#structure">Org. Structure</a></li>
          <li class="has-submenu"><a href="branches.html">Branches &amp; Chapters <svg class="chevron-right" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,4 10,8 6,12"/></svg></a>
            <ul class="submenu">
              <li><a href="branches.html#oron">Oron LGA</a></li>
              <li><a href="branches.html#urueoffong">Urueoffong / Oruko</a></li>
              <li><a href="branches.html#okobo">Okobo</a></li>
              <li><a href="branches.html#mbo">Mbo</a></li>
              <li><a href="branches.html#udunguko">Udunguko</a></li>
              <li><a href="branches.html#domestic">Domestic Branches</a></li>
              <li><a href="branches.html#international">International Chapters</a></li>
            </ul>
          </li>
        </ul>
      </li>
      <li><a href="entertainment.html"$e>Entertainment <svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4,6 8,10 12,6"/></svg></a>
        <ul class="dropdown">
          <li><a href="entertainment.html#events">Upcoming Events</a></li>
          <li><a href="entertainment.html#calendar">Event Calendar</a></li>
          <li><a href="entertainment.html#festivals">Annual Festivals</a></li>
          <li><a href="entertainment.html#livetv">Live TV</a></li>
          <li><a href="entertainment.html#music">Music &amp; Videos</a></li>
        </ul>
      </li>
      <li><a href="elections.html" class="nav-elections"$el>Elections <svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4,6 8,10 12,6"/></svg></a>
        <ul class="dropdown">
          <li><a href="elections.html">Member Voting Portal</a></li>
          <li><a href="register.html">Apply for Membership</a></li>
          <li><a href="endorser.html">Officials / Endorser Login</a></li>
        </ul>
      </li>
      <li><a href="contact.html"$co>Contact</a></li>
      <li><a href="register.html" class="nav-join"$j>Join Us</a></li>
    </ul>
"@
}

$pages = @{
  'about.html'         = 'about'
  'projects.html'      = 'about'
  'culture.html'       = 'culture'
  'leadership.html'    = 'leadership'
  'branches.html'      = 'leadership'
  'entertainment.html' = 'entertainment'
  'tv.html'            = 'entertainment'
  'news.html'          = ''
  'events.html'        = ''
  'elections.html'     = 'elections'
  'endorser.html'      = 'elections'
  'register.html'      = 'join'
  'contact.html'       = 'contact'
}

foreach ($file in $pages.Keys) {
  $path = Join-Path $base $file
  if (-not (Test-Path $path)) { Write-Host "SKIP: $file"; continue }
  $content = Get-Content $path -Raw -Encoding UTF8
  $newNav  = Build-Nav $pages[$file]
  $pattern = '(?s)<ul class="nav-links" id="nav-links">.*</ul>(?=\s*<div class="nav-mobile-toggle")'
  $updated = [regex]::Replace($content, $pattern, $newNav.TrimEnd())
  if ($updated -eq $content) { Write-Host "NO MATCH: $file" }
  else { [System.IO.File]::WriteAllText($path, $updated, [System.Text.Encoding]::UTF8); Write-Host "UPDATED: $file" }
}
Write-Host "Done."
