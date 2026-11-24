Add-Type -AssemblyName System.Drawing

$outputDirectory = $PSScriptRoot
$canvasWidth = 1800
$canvasHeight = 1350

$palette = @{
    Background = [System.Drawing.Color]::FromArgb(247, 249, 252)
    Ink        = [System.Drawing.Color]::FromArgb(24, 35, 50)
    Muted      = [System.Drawing.Color]::FromArgb(85, 99, 118)
    Border     = [System.Drawing.Color]::FromArgb(184, 196, 211)
    White      = [System.Drawing.Color]::White
    Blue       = [System.Drawing.Color]::FromArgb(38, 111, 214)
    BlueFill   = [System.Drawing.Color]::FromArgb(226, 238, 255)
    Green      = [System.Drawing.Color]::FromArgb(26, 133, 92)
    GreenFill  = [System.Drawing.Color]::FromArgb(224, 246, 237)
    Amber      = [System.Drawing.Color]::FromArgb(190, 112, 12)
    AmberFill  = [System.Drawing.Color]::FromArgb(255, 241, 215)
    Red        = [System.Drawing.Color]::FromArgb(180, 61, 67)
    RedFill    = [System.Drawing.Color]::FromArgb(255, 231, 233)
    Purple     = [System.Drawing.Color]::FromArgb(111, 72, 176)
    PurpleFill = [System.Drawing.Color]::FromArgb(239, 232, 252)
}

function New-DiagramCanvas {
    param([string]$Title, [string]$Subtitle, [string]$Accent)

    $bitmap = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight)
    $bitmap.SetResolution(150, 150)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $graphics.Clear($palette.Background)

    $accentColor = $palette[$Accent]
    $graphics.FillRectangle((New-Object System.Drawing.SolidBrush($accentColor)), 0, 0, 24, $canvasHeight)
    $graphics.FillRectangle((New-Object System.Drawing.SolidBrush($palette.White)), 70, 55, 1660, 130)

    $titleFont = New-Object System.Drawing.Font('Segoe UI', 26, [System.Drawing.FontStyle]::Bold)
    $subtitleFont = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Regular)
    $graphics.DrawString($Title, $titleFont, (New-Object System.Drawing.SolidBrush($palette.Ink)), 105, 68)
    $graphics.DrawString($Subtitle, $subtitleFont, (New-Object System.Drawing.SolidBrush($palette.Muted)), 108, 137)

    return @{ Bitmap = $bitmap; Graphics = $graphics; Accent = $accentColor }
}

function Draw-RoundedRectangle {
    param($Graphics, [System.Drawing.Pen]$Pen, [System.Drawing.Brush]$Brush, [int]$X, [int]$Y, [int]$W, [int]$H, [int]$Radius = 18)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $Radius * 2
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $W - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $W - $diameter, $Y + $H - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $H - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    if ($Brush) { $Graphics.FillPath($Brush, $path) }
    if ($Pen) { $Graphics.DrawPath($Pen, $path) }
    $path.Dispose()
}

function Draw-Node {
    param($Graphics, [int]$X, [int]$Y, [int]$W, [int]$H, [string]$Text, [string]$Tone = 'BlueFill', [string]$BorderTone = 'Blue', [int]$FontSize = 12)
    $fill = New-Object System.Drawing.SolidBrush($palette[$Tone])
    $pen = New-Object System.Drawing.Pen($palette[$BorderTone], 2.4)
    Draw-RoundedRectangle $Graphics $pen $fill $X $Y $W $H 18
    $font = New-Object System.Drawing.Font('Segoe UI', $FontSize, [System.Drawing.FontStyle]::Bold)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
    $rect = New-Object System.Drawing.RectangleF(($X + 12), ($Y + 7), ($W - 24), ($H - 14))
    $Graphics.DrawString($Text, $font, (New-Object System.Drawing.SolidBrush($palette.Ink)), $rect, $format)
}

function Draw-Decision {
    param($Graphics, [int]$CenterX, [int]$CenterY, [int]$W, [int]$H, [string]$Text)
    $points = [System.Drawing.Point[]]@(
        (New-Object System.Drawing.Point($CenterX, ($CenterY - [int]($H / 2)))),
        (New-Object System.Drawing.Point(($CenterX + [int]($W / 2)), $CenterY)),
        (New-Object System.Drawing.Point($CenterX, ($CenterY + [int]($H / 2)))),
        (New-Object System.Drawing.Point(($CenterX - [int]($W / 2)), $CenterY))
    )
    $Graphics.FillPolygon((New-Object System.Drawing.SolidBrush($palette.AmberFill)), $points)
    $Graphics.DrawPolygon((New-Object System.Drawing.Pen($palette.Amber, 2.4)), $points)
    $font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(($CenterX - $W / 3), ($CenterY - $H / 3), (2 * $W / 3), (2 * $H / 3))
    $Graphics.DrawString($Text, $font, (New-Object System.Drawing.SolidBrush($palette.Ink)), $rect, $format)
}

function Draw-Arrow {
    param($Graphics, [int]$X1, [int]$Y1, [int]$X2, [int]$Y2, [string]$Label = '', [string]$Tone = 'Muted')
    $pen = New-Object System.Drawing.Pen($palette[$Tone], 3)
    $cap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap(6, 7, $true)
    $pen.CustomEndCap = $cap
    $Graphics.DrawLine($pen, $X1, $Y1, $X2, $Y2)
    if ($Label) {
        $font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
        $labelX = [int](($X1 + $X2) / 2) - 45
        $labelY = [int](($Y1 + $Y2) / 2) - 25
        $format = New-Object System.Drawing.StringFormat
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $Graphics.DrawString($Label, $font, (New-Object System.Drawing.SolidBrush($palette[$Tone])), (New-Object System.Drawing.RectangleF($labelX, $labelY, 90, 24)), $format)
    }
}

function Draw-LaneLabel {
    param($Graphics, [int]$X, [int]$Y, [string]$Text, [string]$Tone)
    $font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
    $Graphics.DrawString($Text.ToUpperInvariant(), $font, (New-Object System.Drawing.SolidBrush($palette[$Tone])), $X, $Y)
}

function Draw-AgentStrip {
    param($Graphics, [string]$Role, [bool]$Authenticated, [string]$Tone)
    Draw-LaneLabel $Graphics 80 1125 'Agentic AI path' $Tone
    if (-not $Authenticated) {
        Draw-Node $Graphics 80 1170 280 82 'Request member-only action' 'BlueFill' 'Blue' 11
        Draw-Node $Graphics 440 1170 250 82 'Sign in or register' 'PurpleFill' 'Purple' 11
        Draw-Node $Graphics 770 1170 330 82 'Enter as Buyer and open agent' 'GreenFill' 'Green' 11
        Draw-Node $Graphics 1180 1170 520 82 'Agent access requires an authenticated member role' 'AmberFill' 'Amber' 11
        Draw-Arrow $Graphics 360 1211 440 1211
        Draw-Arrow $Graphics 690 1211 770 1211
        Draw-Arrow $Graphics 1100 1211 1180 1211
        return
    }

    Draw-Node $Graphics 70 1170 250 82 "$Role sets a goal" 'PurpleFill' 'Purple' 11
    Draw-Node $Graphics 380 1170 250 82 'Plan and select tool' 'AmberFill' 'Amber' 11
    Draw-Node $Graphics 690 1170 300 82 'Run approved read-only tool' 'BlueFill' 'Blue' 11
    Draw-Node $Graphics 1050 1170 250 82 'Observe and adapt' 'AmberFill' 'Amber' 11
    Draw-Node $Graphics 1360 1170 370 82 'Answer + persisted AiJob trace' 'GreenFill' 'Green' 11
    Draw-Arrow $Graphics 320 1211 380 1211
    Draw-Arrow $Graphics 630 1211 690 1211
    Draw-Arrow $Graphics 990 1211 1050 1211
    Draw-Arrow $Graphics 1300 1211 1360 1211
}

function Save-Diagram {
    param($Canvas, [string]$FileName)
    $path = Join-Path $outputDirectory $FileName
    $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
    $parameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]94)
    $Canvas.Bitmap.Save($path, $encoder, $parameters)
    $Canvas.Graphics.Dispose()
    $Canvas.Bitmap.Dispose()
}

# Visitor
$c = New-DiagramCanvas 'iHobby Visitor Flow' 'Public discovery, listing exploration, and account entry points' 'Blue'
$g = $c.Graphics
Draw-LaneLabel $g 100 220 'Public marketplace' 'Blue'
Draw-Node $g 100 270 240 82 'Visit iHobby' 'BlueFill' 'Blue'
Draw-Node $g 430 270 280 82 'Browse or search RC marketplace' 'BlueFill' 'Blue'
Draw-Node $g 800 270 250 82 'Open category or listing' 'BlueFill' 'Blue'
Draw-Decision $g 1220 311 250 130 'Take an account action?'
Draw-Node $g 1400 470 260 84 'Continue browsing public listings' 'GreenFill' 'Green'
Draw-Decision $g 970 540 230 125 'Existing account?'
Draw-Node $g 560 700 250 82 'Register account' 'PurpleFill' 'Purple'
Draw-Node $g 940 700 250 82 'Sign in' 'PurpleFill' 'Purple'
Draw-Node $g 750 900 260 84 'Enter as Buyer' 'GreenFill' 'Green'
Draw-Arrow $g 340 311 430 311
Draw-Arrow $g 710 311 800 311
Draw-Arrow $g 1050 311 1095 311
Draw-Arrow $g 1345 340 1460 470 'No' 'Green'
Draw-Arrow $g 1170 375 1030 480 'Yes' 'Amber'
Draw-Arrow $g 855 575 685 700 'No' 'Purple'
Draw-Arrow $g 1015 600 1060 700 'Yes' 'Purple'
Draw-Arrow $g 685 782 815 900
Draw-Arrow $g 1060 782 945 900
Draw-Arrow $g 1530 554 1530 1000 'Browse' 'Green'
Draw-Arrow $g 1530 1000 1010 1000
Draw-Arrow $g 1010 1000 1010 942
Draw-AgentStrip $g 'Visitor' $false 'Blue'
Save-Diagram $c '01-visitor-flow.jpg'

# Buyer
$c = New-DiagramCanvas 'Buyer Actor Flow | iHobby' 'Purchasing activity, member tools, and the path to becoming a seller' 'Green'
$g = $c.Graphics
Draw-LaneLabel $g 100 220 'Member entry' 'Green'
Draw-Node $g 100 270 220 80 'Register or sign in' 'GreenFill' 'Green'
Draw-Node $g 400 270 230 80 'Buyer dashboard' 'GreenFill' 'Green'
Draw-Decision $g 790 310 250 135 'Choose activity'
Draw-LaneLabel $g 90 475 'Marketplace' 'Blue'
Draw-Node $g 90 525 250 82 'Open eligible listing' 'BlueFill' 'Blue'
Draw-Node $g 410 525 310 82 'Bid, offer, watch, or message' 'BlueFill' 'Blue'
Draw-Node $g 790 525 260 82 'Persist action and notify' 'GreenFill' 'Green'
Draw-Decision $g 1215 566 235 125 'Offer accepted?'
Draw-Node $g 1430 525 250 82 'Submit one seller review' 'PurpleFill' 'Purple'
Draw-LaneLabel $g 90 720 'Tools and account' 'Purple'
Draw-Node $g 90 770 270 82 'Build, repair, or pricing tool' 'PurpleFill' 'Purple'
Draw-Node $g 430 770 250 82 'Save member result' 'PurpleFill' 'Purple'
Draw-Node $g 750 770 250 82 'Wallet, loyalty, notifications' 'PurpleFill' 'Purple'
Draw-LaneLabel $g 1070 720 'Seller application' 'Amber'
Draw-Node $g 1070 770 230 82 'Submit application' 'AmberFill' 'Amber'
Draw-Node $g 1370 770 230 82 'Admin review' 'AmberFill' 'Amber'
Draw-Decision $g 1485 985 235 120 'Approved?'
Draw-Node $g 1070 945 250 82 'Remain Buyer with feedback' 'RedFill' 'Red'
Draw-Node $g 1600 945 150 82 'Seller role' 'GreenFill' 'Green' 13
Draw-Arrow $g 320 310 400 310
Draw-Arrow $g 630 310 665 310
Draw-Arrow $g 730 375 260 525 '' 'Blue'
Draw-Arrow $g 790 378 235 770 '' 'Purple'
Draw-Arrow $g 850 375 1185 770 '' 'Amber'
Draw-Arrow $g 340 566 410 566
Draw-Arrow $g 720 566 790 566
Draw-Arrow $g 1050 566 1098 566
Draw-Arrow $g 1333 566 1430 566 'Yes' 'Green'
Draw-Arrow $g 1215 628 1215 680 'No' 'Muted'
Draw-Arrow $g 1215 680 790 680
Draw-Arrow $g 790 680 790 607
Draw-Arrow $g 360 811 430 811
Draw-Arrow $g 680 811 750 811
Draw-Arrow $g 1300 811 1370 811
Draw-Arrow $g 1485 852 1485 925
Draw-Arrow $g 1368 985 1320 985 'No' 'Red'
Draw-Arrow $g 1603 985 1600 985 'Yes' 'Green'
Draw-AgentStrip $g 'Buyer' $true 'Green'
Save-Diagram $c '02-buyer-flow.jpg'

# Seller
$c = New-DiagramCanvas 'Seller Actor Flow | iHobby' 'Listing lifecycle, inventory control, offers, and buyer communication' 'Purple'
$g = $c.Graphics
Draw-Node $g 90 250 220 80 'Sign in as Seller' 'PurpleFill' 'Purple'
Draw-Node $g 390 250 250 80 'Seller dashboard' 'PurpleFill' 'Purple'
Draw-Decision $g 790 290 250 135 'Choose activity'
Draw-LaneLabel $g 80 450 'Create listing' 'Blue'
Draw-Node $g 80 500 270 82 'Enter details and upload media' 'BlueFill' 'Blue'
Draw-Node $g 420 500 250 82 'Pending review' 'AmberFill' 'Amber'
Draw-Decision $g 820 541 240 125 'Admin decision'
Draw-Node $g 1020 500 230 82 'Active listing + reward' 'GreenFill' 'Green'
Draw-Node $g 720 700 250 82 'Rejected: revise listing' 'RedFill' 'Red'
Draw-LaneLabel $g 1280 450 'Buyer activity' 'Green'
Draw-Node $g 1280 500 250 82 'Receive offer or message' 'GreenFill' 'Green'
Draw-Decision $g 1435 730 240 125 'Accept offer?'
Draw-Node $g 1570 875 170 82 'Sold + notify' 'GreenFill' 'Green' 13
Draw-Node $g 1210 875 210 82 'Decline + notify' 'RedFill' 'Red' 13
Draw-LaneLabel $g 80 850 'Manage inventory' 'Purple'
Draw-Node $g 80 900 270 82 'Edit, pause, resume, archive' 'PurpleFill' 'Purple'
Draw-Decision $g 510 941 240 125 'Edited while active?'
Draw-Node $g 720 900 250 82 'Return to pending review' 'AmberFill' 'Amber'
Draw-Arrow $g 310 290 390 290
Draw-Arrow $g 640 290 665 290
Draw-Arrow $g 740 355 215 500 '' 'Blue'
Draw-Arrow $g 850 355 1530 500 '' 'Green'
Draw-Arrow $g 790 358 215 900 '' 'Purple'
Draw-Arrow $g 350 541 420 541
Draw-Arrow $g 670 541 700 541
Draw-Arrow $g 940 541 1020 541 'Approve' 'Green'
Draw-Arrow $g 820 603 845 700 'Reject' 'Red'
Draw-Arrow $g 845 700 845 582
Draw-Arrow $g 1250 541 1280 541
Draw-Arrow $g 1400 582 1415 668
Draw-Arrow $g 1555 730 1655 875 'Yes' 'Green'
Draw-Arrow $g 1315 730 1315 875 'No' 'Red'
Draw-Arrow $g 350 941 390 941
Draw-Arrow $g 630 941 720 941 'Yes' 'Amber'
Draw-Arrow $g 845 900 845 782
Draw-AgentStrip $g 'Seller' $true 'Purple'
Save-Diagram $c '03-seller-flow.jpg'

# Admin
$c = New-DiagramCanvas 'iHobby Admin Flow' 'Marketplace governance, approvals, user controls, and auditability' 'Red'
$g = $c.Graphics
Draw-Node $g 90 250 220 80 'Sign in as Admin' 'RedFill' 'Red'
Draw-Node $g 390 250 250 80 'Admin dashboard' 'RedFill' 'Red'
Draw-Decision $g 800 290 270 140 'Choose operation'
Draw-LaneLabel $g 70 460 'Listings and reports' 'Blue'
Draw-Node $g 70 510 240 82 'Review listing' 'BlueFill' 'Blue'
Draw-Decision $g 440 551 220 120 'Approve?'
Draw-Node $g 580 480 250 82 'Publish + reward seller' 'GreenFill' 'Green'
Draw-Node $g 580 620 250 82 'Reject + notify seller' 'RedFill' 'Red'
Draw-Node $g 70 750 240 82 'Review report' 'BlueFill' 'Blue'
Draw-Node $g 380 750 260 82 'Resolve or dismiss report' 'BlueFill' 'Blue'
Draw-LaneLabel $g 910 460 'Seller applications' 'Amber'
Draw-Node $g 910 510 250 82 'Review application' 'AmberFill' 'Amber'
Draw-Decision $g 1300 551 220 120 'Approve?'
Draw-Node $g 1440 480 280 82 'Promote to Seller + reward' 'GreenFill' 'Green'
Draw-Node $g 1440 620 280 82 'Reject + save reviewer note' 'RedFill' 'Red'
Draw-LaneLabel $g 900 750 'Platform operations' 'Purple'
Draw-Node $g 900 800 230 82 'Manage users' 'PurpleFill' 'Purple'
Draw-Node $g 1190 800 230 82 'Manage categories' 'PurpleFill' 'Purple'
Draw-Node $g 1480 800 230 82 'Messages + readiness' 'PurpleFill' 'Purple'
Draw-Node $g 700 1010 400 82 'Persist moderation action and audit log' 'AmberFill' 'Amber'
Draw-Arrow $g 310 290 390 290
Draw-Arrow $g 640 290 665 290
Draw-Arrow $g 745 360 190 510 '' 'Blue'
Draw-Arrow $g 855 360 1035 510 '' 'Amber'
Draw-Arrow $g 800 360 1015 800 '' 'Purple'
Draw-Arrow $g 310 551 330 551
Draw-Arrow $g 550 530 580 521 'Yes' 'Green'
Draw-Arrow $g 550 575 580 661 'No' 'Red'
Draw-Arrow $g 190 592 190 750
Draw-Arrow $g 310 791 380 791
Draw-Arrow $g 1160 551 1190 551
Draw-Arrow $g 1410 530 1440 521 'Yes' 'Green'
Draw-Arrow $g 1410 575 1440 661 'No' 'Red'
Draw-Arrow $g 1250 882 940 1010
Draw-Arrow $g 1595 882 1030 1010
Draw-Arrow $g 510 832 760 1010
Draw-Arrow $g 705 702 830 1010
Draw-Arrow $g 1580 702 990 1010
Draw-AgentStrip $g 'Admin' $true 'Red'
Save-Diagram $c '04-admin-flow.jpg'

# Shared agent architecture
$c = New-DiagramCanvas 'Agentic AI System Flow | iHobby' 'Bounded planning, approved tools, adaptive observations, and auditable outcomes' 'Purple'
$g = $c.Graphics
Draw-LaneLabel $g 80 220 'Request and controls' 'Purple'
Draw-Node $g 80 270 240 82 'Authenticated member goal' 'PurpleFill' 'Purple'
Draw-Node $g 390 270 270 82 'Validate input + RBAC' 'RedFill' 'Red'
Draw-Node $g 730 270 250 82 'Apply rate limit' 'RedFill' 'Red'
Draw-Node $g 1050 270 300 82 'Create AiJob: QUEUED' 'AmberFill' 'Amber'
Draw-Node $g 1420 270 300 82 'Set AiJob: RUNNING' 'AmberFill' 'Amber'
Draw-Arrow $g 320 311 390 311
Draw-Arrow $g 660 311 730 311
Draw-Arrow $g 980 311 1050 311
Draw-Arrow $g 1350 311 1420 311

Draw-LaneLabel $g 80 440 'Plan - Act - Observe loop' 'Blue'
Draw-Node $g 80 490 260 90 'Model plans next safe step' 'PurpleFill' 'Purple'
Draw-Decision $g 500 535 250 135 'Tool call or final answer?'
Draw-Node $g 700 490 310 90 'Validate tool name and arguments' 'RedFill' 'Red'
Draw-Node $g 1080 490 300 90 'Execute role-scoped tool' 'BlueFill' 'Blue'
Draw-Node $g 1450 490 270 90 'Capture observation' 'GreenFill' 'Green'
Draw-Arrow $g 340 535 375 535
Draw-Arrow $g 625 535 700 535 'Tool' 'Blue'
Draw-Arrow $g 1010 535 1080 535
Draw-Arrow $g 1380 535 1450 535
Draw-Arrow $g 1585 580 1585 680
Draw-Arrow $g 1585 680 210 680
Draw-Arrow $g 210 680 210 580 'Adapt' 'Purple'

Draw-LaneLabel $g 80 755 'Approved read-only tools' 'Green'
Draw-Node $g 80 805 300 82 'Search active marketplace' 'GreenFill' 'Green' 11
Draw-Node $g 450 805 300 82 'Inspect listing details' 'GreenFill' 'Green' 11
Draw-Node $g 820 805 300 82 'Calculate pricing guidance' 'GreenFill' 'Green' 11
Draw-Node $g 1190 805 530 82 'Read member role-scoped account snapshot' 'GreenFill' 'Green' 11

Draw-LaneLabel $g 80 965 'Model resilience and completion' 'Amber'
Draw-Node $g 80 1015 280 90 'Request next agent decision' 'AmberFill' 'Amber' 11
Draw-Decision $g 520 1060 250 135 'Provider succeeds?'
Draw-Node $g 700 990 300 90 'Use live model decision' 'PurpleFill' 'Purple' 11
Draw-Node $g 700 1140 300 90 'Use deterministic local planner' 'BlueFill' 'Blue' 11
Draw-Node $g 1080 1015 290 90 'Continue loop or finalize' 'AmberFill' 'Amber' 11
Draw-Node $g 1450 1015 270 90 'Persist and show full trace' 'GreenFill' 'Green' 11
Draw-Arrow $g 360 1060 395 1060
Draw-Arrow $g 645 1040 700 1035 'Yes' 'Green'
Draw-Arrow $g 520 1128 700 1185 'No' 'Blue'
Draw-Arrow $g 1000 1035 1080 1060
Draw-Arrow $g 1000 1185 1225 1105
Draw-Arrow $g 1370 1060 1450 1060
Save-Diagram $c '05-agentic-ai-system-flow.jpg'

Get-ChildItem $outputDirectory -Filter '*-flow.jpg' | Select-Object Name, Length
