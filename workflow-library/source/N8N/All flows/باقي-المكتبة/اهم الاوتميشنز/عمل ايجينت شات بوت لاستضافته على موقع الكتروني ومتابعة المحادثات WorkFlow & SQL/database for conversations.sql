
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


-- --------------------------------------------------------

--
-- Table structure for table `conversations`
--

CREATE TABLE `conversations` (
  `id` int(11) NOT NULL,
  `phone_number` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `started_at` datetime DEFAULT current_timestamp(),
  `last_message_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `status` enum('open','closed') DEFAULT 'open',
  `client_id` int(11) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `messages`
--

CREATE TABLE `messages` (
  `id` int(11) NOT NULL,
  `conversation_id` int(11) DEFAULT NULL,
  `sender_type` enum('user','bot','admin') DEFAULT 'user',
  `message_text` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `message_type` enum('text','image','video','file','audio') DEFAULT 'text',
  `message_direction` enum('incoming','outgoing') DEFAULT 'incoming',
  `is_read` int(1) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `client_id` int(11) DEFAULT NULL,
  `message_id` varchar(100) DEFAULT NULL,
  `status` enum('sent','failed','delivered','read') DEFAULT 'sent'
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `conversations`
--
ALTER TABLE `conversations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `conversations`
--
ALTER TABLE `conversations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `messages`
--
ALTER TABLE `messages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!by ahmedelserafy.com */;